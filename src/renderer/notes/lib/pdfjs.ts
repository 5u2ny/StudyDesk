let pdfjsLibPromise: Promise<typeof import('pdfjs-dist')> | null = null

export async function loadPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist').then(async (lib) => {
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
      lib.GlobalWorkerOptions.workerSrc = workerUrl
      return lib
    })
  }
  return pdfjsLibPromise
}
