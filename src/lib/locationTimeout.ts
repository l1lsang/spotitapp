export async function withLocationTimeout<T>(request: Promise<T>, timeoutMs = 15_000,
  message = '현재 위치를 확인하는 데 시간이 오래 걸립니다. 위치 서비스와 네트워크를 확인한 뒤 다시 시도해 주세요.'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally { clearTimeout(timer) }
}
