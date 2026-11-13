export interface GalleryProgress { done: number; total: number }

async function galleryCommand(
  type: "GALLERY_STATUS" | "GALLERY_DOWNLOAD",
  onProgress?: (progress: GalleryProgress) => void,
): Promise<GalleryProgress> {
  if (!window.isSecureContext || !("serviceWorker" in navigator)) {
    throw new Error("請使用正式 HTTPS 網址開啟，才能儲存離線照片。");
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ready = navigator.serviceWorker.ready;
  const unavailable = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("離線服務尚未就緒，請先連線重新開啟正式網站。")), 20000);
  });
  const registration = await Promise.race([ready, unavailable]).finally(() => clearTimeout(timer));
  const worker = registration.active;
  if (!worker) throw new Error("離線服務仍在啟動，請稍等後再試。");

  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    let watchdog: ReturnType<typeof setTimeout>;
    const close = () => { clearTimeout(watchdog); channel.port1.close(); };
    const wait = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        close();
        reject(new Error("離線服務暫時沒有回應，請重新開啟圖鑑後再試。"));
      }, type === "GALLERY_STATUS" ? 10000 : 120000);
    };
    channel.port1.onmessage = ({ data }) => {
      if (data.type === "progress") {
        onProgress?.({ done: data.done, total: data.total });
        wait();
      } else if (data.type === "complete") {
        close();
        resolve({ done: data.done, total: data.total });
      } else if (data.type === "error") {
        close();
        reject(new Error(data.message));
      }
    };
    wait();
    try { worker.postMessage({ type }, [channel.port2]); }
    catch { close(); reject(new Error("離線服務已更新，請重新開啟圖鑑。")); }
  });
}

export const getGalleryOfflineStatus = () => galleryCommand("GALLERY_STATUS");
export const downloadGalleryOffline = (onProgress?: (progress: GalleryProgress) => void) =>
  galleryCommand("GALLERY_DOWNLOAD", onProgress);
