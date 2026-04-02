import { VideoStatus } from '@/types/video-script';

const statusConfig: Record<string, { label: string; className: string; dot: string }> = {
  [VideoStatus.PUBLISHED]: { label: 'Published', className: 'badge-published', dot: '✅' },
  [VideoStatus.FAILED]: { label: 'Failed', className: 'badge-failed', dot: '❌' },
  [VideoStatus.PROCESSING]: { label: 'Processing', className: 'badge-processing', dot: '⏳' },
  [VideoStatus.PENDING]: { label: 'Pending', className: 'badge-pending', dot: '🕐' },
  [VideoStatus.PENDING_APPROVAL]: { label: 'Pending Approval', className: 'badge-pending', dot: '👁️' },
  [VideoStatus.READY_FOR_VIDEO]: { label: 'Ready for Video', className: 'badge-processing', dot: '🎬' },
  [VideoStatus.READY_FOR_UPLOAD]: { label: 'Ready for Upload', className: 'badge-processing', dot: '📤' },
  [VideoStatus.UPLOAD_PENDING]: { label: 'Upload Pending', className: 'badge-pending', dot: '⏸️' },
  [VideoStatus.APPROVED_FOR_SYNTHESIS]: { label: 'Approved', className: 'badge-published', dot: '✔️' },
};

interface VideoStatusBadgeProps {
  status: string;
}

export default function VideoStatusBadge({ status }: VideoStatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status,
    className: 'badge-pending',
    dot: '❓',
  };

  return (
    <span className={`badge ${config.className}`}>
      {config.dot} {config.label}
    </span>
  );
}
