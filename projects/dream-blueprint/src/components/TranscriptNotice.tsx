import { useSyncExternalStore } from 'react'
import { driveLogsCanRetry, driveLogWarning, retryDriveLogs, subscribeDriveLog } from '../lib/drive'

export default function TranscriptNotice() {
  const warning = useSyncExternalStore(subscribeDriveLog, driveLogWarning, () => '')
  const canRetry = useSyncExternalStore(subscribeDriveLog, driveLogsCanRetry, () => false)
  if (!warning) return null
  return <div className="exam-offer">
    <span role="status">{warning}</span>{' '}
    <button type="button" className="pr-link" onClick={retryDriveLogs} disabled={!canRetry}>補傳逐字稿</button>
  </div>
}
