import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { MEDIA_BUCKET, PROJECTS_TABLE, isSupabaseConfigured, supabase } from './lib/supabaseClient'
import { IMAGE_VARIANTS, buildImageVariants, formatBytes } from './lib/imageVariants'

const MEDIA_ROOT = 'project'

const categories = [
  { value: 'retail', label: 'Retail' },
  { value: 'interior', label: 'Interior' },
  { value: 'residential', label: 'Residential' },
  { value: 'architecture', label: 'Architecture' },
  { value: 'commercial', label: 'Commercial' },
]

const emptyForm = {
  name: '',
  tagline: '',
  description: '',
  categories: ['retail'],
  mainPhoto: null,
  projectPhotos: [],
}

function App() {
  const [session, setSession] = useState(null)
  const [authForm, setAuthForm] = useState({ email: '', password: '' })
  const [authStatus, setAuthStatus] = useState('idle')
  const [authError, setAuthError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [submitStatus, setSubmitStatus] = useState('idle')
  const [submitError, setSubmitError] = useState('')
  const [progress, setProgress] = useState([])
  const [createdProject, setCreatedProject] = useState(null)

  const totalSelectedSize = useMemo(() => {
    const files = [form.mainPhoto, ...form.projectPhotos].filter(Boolean)
    return files.reduce((total, file) => total + file.size, 0)
  }, [form.mainPhoto, form.projectPhotos])

  useEffect(() => {
    if (!supabase) return undefined

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleLogin(event) {
    event.preventDefault()
    setAuthStatus('loading')
    setAuthError('')

    const { error } = await supabase.auth.signInWithPassword({
      email: authForm.email.trim(),
      password: authForm.password,
    })

    if (error) {
      setAuthError(getAuthErrorMessage(error))
      setAuthStatus('idle')
      return
    }

    setAuthStatus('idle')
  }

  async function handleSignOut() {
    await supabase.auth.signOut({ scope: 'local' })
    setCreatedProject(null)
  }

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    setSubmitStatus('loading')
    setSubmitError('')
    setCreatedProject(null)
    setProgress([])

    try {
      validateForm(form)

      const projectSlug = await getNextProjectFolder()
      pushProgress(projectSlug, 'Created project folder')
      const mainImage = await uploadImageSet(form.mainPhoto, projectSlug, 1, 'main')
      const galleryImages = []

      for (const [index, file] of form.projectPhotos.entries()) {
        galleryImages.push(await uploadImageSet(file, projectSlug, index + 2, `gallery-${index + 1}`))
      }

      const { data, error } = await supabase
        .from(PROJECTS_TABLE)
        .insert({
          slug: projectSlug,
          name: form.name.trim(),
          tagline: form.tagline.trim(),
          description: form.description.trim(),
          category: getSelectedCategories(form)[0],
          categories: getSelectedCategories(form),
          main_image: mainImage,
          gallery_images: galleryImages,
          created_by: session.user.id,
        })
        .select()
        .single()

      if (error) throw new Error(`Project metadata insert failed: ${error.message}`)

      setCreatedProject(data)
      setForm(emptyForm)
      formElement.reset()
    } catch (error) {
      setSubmitError(error.message)
    } finally {
      setSubmitStatus('idle')
    }
  }

  async function uploadImageSet(file, projectSlug, imageNumber, imageKey) {
    pushProgress(file.name, 'Creating image sizes')
    const variants = await buildImageVariants(file)
    const uploaded = {
      originalName: file.name,
      alt: `${form.name.trim()} ${imageKey === 'main' ? 'main image' : 'project photo'}`,
      variants: {},
    }

    for (const variant of variants) {
      const path = `${MEDIA_ROOT}/${projectSlug}/${variant.key}/${imageNumber}.webp`
      pushProgress(file.name, `Uploading ${variant.label}`)

      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, variant.blob, {
        cacheControl: '31536000',
        contentType: variant.contentType,
        upsert: true,
      })

      if (error) throw new Error(`Storage upload failed for ${path}: ${error.message}`)

      const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path)
      uploaded.variants[variant.key] = {
        path,
        url: data.publicUrl,
        role: imageKey,
        order: imageNumber,
        width: variant.width,
        height: variant.height,
        size: variant.blob.size,
      }
    }

    pushProgress(file.name, 'Complete')
    return uploaded
  }

  async function getNextProjectFolder() {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(MEDIA_ROOT, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })

    if (error) throw new Error(`Could not read existing project folders from the ${MEDIA_BUCKET} bucket: ${error.message}`)

    const maxProjectNumber = data.reduce((highest, item) => {
      const match = /^proj(\d+)$/.exec(item.name)
      if (!match) return highest

      return Math.max(highest, Number(match[1]))
    }, 0)

    return `proj${maxProjectNumber + 1}`
  }

  function pushProgress(fileName, message) {
    setProgress((current) => [
      { id: `${fileName}-${message}-${Date.now()}`, fileName, message },
      ...current.slice(0, 7),
    ])
  }

  function toggleCategory(categoryValue) {
    setForm((current) => {
      const nextCategories = current.categories.includes(categoryValue)
        ? current.categories.filter((value) => value !== categoryValue)
        : [...current.categories, categoryValue]

      return {
        ...current,
        categories: nextCategories,
      }
    })
  }

  if (!isSupabaseConfigured) {
    return <SetupNotice />
  }

  if (!session) {
    return (
      <main className="auth-shell">
        <section className="login-panel" aria-labelledby="login-title">
          <div>
            <p className="eyebrow">Lineup Studio</p>
            <h1 className="login-title">Admin access</h1>
            {/* <p className="muted">Use the admin email and password created in Supabase Auth.</p> */}
          </div>

          <form className="stack" onSubmit={handleLogin}>
            <label>
              Username or email
              <input
                autoComplete="username"
                inputMode="email"
                name="email"
                onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                required
                type="email"
                value={authForm.email}
              />
            </label>

            <label>
              Password
              <input
                autoComplete="current-password"
                name="password"
                onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                required
                type="password"
                value={authForm.password}
              />
            </label>

            {authError ? <p className="error">{authError}</p> : null}

            <button className="primary-button" disabled={authStatus === 'loading'} type="submit">
              {authStatus === 'loading' ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="admin-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Lineup Studio</p>
          <h1>Admin portal</h1>
        </div>
        <button className="ghost-button" onClick={handleSignOut} type="button">
          Sign out
        </button>
      </header>

      <section className="workspace">
        <form className="project-form" onSubmit={handleSubmit}>
          <div className="form-section">
            <h2>Project details</h2>
            <div className="grid two-columns">
              <label>
                Project name
                <input
                  name="name"
                  onChange={(event) => updateForm('name', event.target.value)}
                  placeholder="Oak House"
                  required
                  type="text"
                  value={form.name}
                />
              </label>

              <label>
                Tagline
                <input
                  name="tagline"
                  onChange={(event) => updateForm('tagline', event.target.value)}
                  placeholder="Warm minimal residence in Ahmedabad"
                  required
                  type="text"
                  value={form.tagline}
                />
              </label>
            </div>

            <label>
              Project description
              <textarea
                name="description"
                onChange={(event) => updateForm('description', event.target.value)}
                placeholder="Describe the project, brief, materials, location, or design intent."
                required
                rows="6"
                value={form.description}
              />
            </label>

            <fieldset>
              <legend>Project categories</legend>
              <div className="category-grid">
                {categories.map((category) => (
                  <label className="category-tile" key={category.value}>
                    <input
                      checked={getSelectedCategories(form).includes(category.value)}
                      name="categories"
                      onChange={() => toggleCategory(category.value)}
                      type="checkbox"
                      value={category.value}
                    />
                    <span>{category.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="form-section">
            <h2>Media</h2>
            <div className="grid two-columns">
              <FileInput
                file={form.mainPhoto}
                label="Main project photo"
                name="mainPhoto"
                onChange={(files) => updateForm('mainPhoto', files[0] ?? null)}
                required
              />

              <FileInput
                fileCount={form.projectPhotos.length}
                label="Project photo gallery"
                multiple
                name="projectPhotos"
                onChange={(files) => updateForm('projectPhotos', files)}
              />
            </div>

            <div className="variant-strip" aria-label="Generated image variants">
              {IMAGE_VARIANTS.map((variant) => (
                <span key={variant.key}>{variant.label}</span>
              ))}
            </div>

            <p className="muted">
              Selected media: {formatBytes(totalSelectedSize)}. Only WebP uploads are accepted; each photo is resized into
              the five Supabase folders before upload.
            </p>
          </div>

          {submitError ? <p className="error">{submitError}</p> : null}
          {createdProject ? <p className="success">Project uploaded: {createdProject.name}</p> : null}

          <button className="primary-button submit-button" disabled={submitStatus === 'loading'} type="submit">
            {submitStatus === 'loading' ? 'Processing uploads...' : 'Submit project'}
          </button>
        </form>

        <aside className="status-panel" aria-labelledby="status-title">
          <h2 id="status-title">Upload status</h2>
          {progress.length ? (
            <ol>
              {progress.map((item) => (
                <li key={item.id}>
                  <strong>{item.fileName}</strong>
                  <span>{item.message}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">Upload activity will appear here after submitting a project.</p>
          )}
        </aside>
      </section>
    </main>
  )
}

function FileInput({ file, fileCount, label, multiple = false, name, onChange, required = false }) {
  return (
    <label className="file-zone">
      <span>{label}</span>
      <input
        accept="image/webp,.webp"
        multiple={multiple}
        name={name}
        onChange={(event) => onChange(Array.from(event.target.files))}
        required={required}
        type="file"
      />
      <small>
        {file ? `${file.name} (${formatBytes(file.size)})` : null}
        {!file && fileCount ? `${fileCount} photos selected` : null}
        {!file && !fileCount ? 'WebP only' : null}
      </small>
    </label>
  )
}

function SetupNotice() {
  return (
    <main className="auth-shell">
      <section className="login-panel">
        <p className="eyebrow">Setup required</p>
        <h1>Connect Supabase</h1>
        <p className="muted">
          Create a local .env file from .env.example and add your Supabase project URL and anon key.
        </p>
      </section>
    </main>
  )
}

function validateForm(form) {
  const files = [form.mainPhoto, ...form.projectPhotos].filter(Boolean)
  const selectedCategories = getSelectedCategories(form)

  if (!form.name.trim()) throw new Error('Project name is required.')
  if (!form.tagline.trim()) throw new Error('Tagline is required.')
  if (!form.description.trim()) throw new Error('Project description is required.')
  if (!selectedCategories.length) throw new Error('Select at least one project category.')
  if (!form.mainPhoto) throw new Error('Main project photo is required.')

  const invalidFile = files.find((file) => file.type !== 'image/webp' || !file.name.toLowerCase().endsWith('.webp'))
  if (invalidFile) throw new Error(`${invalidFile.name} is not a WebP image. Please upload .webp files only.`)
}

function getSelectedCategories(form) {
  if (Array.isArray(form.categories)) return form.categories
  if (form.category) return [form.category]

  return []
}

function getAuthErrorMessage(error) {
  const message = error.message || 'Unable to sign in.'

  if (message.toLowerCase().includes('invalid login credentials')) {
    return [
      'Invalid login credentials.',
      'Check that this exact email exists under Supabase Authentication > Users for the project in your .env.',
      'If the user is unconfirmed, confirm it or recreate it with Auto Confirm User enabled.',
    ].join(' ')
  }

  return message
}

export default App
