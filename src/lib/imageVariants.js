export const IMAGE_VARIANTS = [
  { key: 'blurred', label: 'Blurred', width: 20, height: 15, quality: 0.38, blur: 4 },
  { key: 'desktop', label: 'Desktop', width: 1600, height: 1200, quality: 0.84 },
  { key: 'tablet', label: 'Tablet', width: 960, height: 720, quality: 0.82 },
  { key: 'mobile', label: 'Mobile', width: 480, height: 360, quality: 0.8 },
  { key: 'mobile-small', label: 'Mobile small', width: 220, height: 165, quality: 0.78 },
]

const OUTPUT_TYPE = 'image/webp'

export function formatBytes(bytes) {
  if (!bytes) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const size = bytes / 1024 ** index

  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

export async function buildImageVariants(file) {
  const image = await loadImage(file)

  return Promise.all(
    IMAGE_VARIANTS.map(async (variant) => {
      const { blob, width, height } = await renderVariant(image, variant)

      return {
        ...variant,
        blob,
        width,
        height,
        contentType: OUTPUT_TYPE,
        extension: 'webp',
      }
    }),
  )
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Could not read ${file.name}`))
    }

    image.src = url
  })
}

function renderVariant(image, variant) {
  const width = variant.width
  const height = variant.height
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  const sourceRatio = image.naturalWidth / image.naturalHeight
  const targetRatio = width / height
  let sourceWidth = image.naturalWidth
  let sourceHeight = image.naturalHeight
  let sourceX = 0
  let sourceY = 0

  if (sourceRatio > targetRatio) {
    sourceWidth = Math.round(image.naturalHeight * targetRatio)
    sourceX = Math.round((image.naturalWidth - sourceWidth) / 2)
  } else if (sourceRatio < targetRatio) {
    sourceHeight = Math.round(image.naturalWidth / targetRatio)
    sourceY = Math.round((image.naturalHeight - sourceHeight) / 2)
  }

  canvas.width = width
  canvas.height = height

  context.fillStyle = '#f7f5f0'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  if (variant.blur) {
    context.filter = `blur(${variant.blur}px)`
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Could not create ${variant.label} image`))
          return
        }

        resolve({ blob, width, height })
      },
      OUTPUT_TYPE,
      variant.quality,
    )
  })
}
