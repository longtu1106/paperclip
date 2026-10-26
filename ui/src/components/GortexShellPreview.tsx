import type { ShellPreview } from "../api/gortex-flow";

export function GortexShellPreview({ preview }: { preview?: ShellPreview }) {
  if (!preview)
    return (
      <p className="text-xs text-muted-foreground">
        Lần gọi này chưa có bản xem trước lệnh/kết quả.
      </p>
    );
  return (
    <div className="min-w-0 space-y-3 text-xs">
      <div className="space-y-1">
        <p className="font-medium">Lệnh đã gọi</p>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono">
          {preview.command || "Không có nội dung lệnh"}
        </pre>
      </div>
      <div className="space-y-1">
        <p className="font-medium">
          Kết quả rút gọn
          {preview.exitCode != null ? ` · exit ${preview.exitCode}` : ""}
        </p>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono">
          {preview.output || "Chưa có đầu ra được gửi"}
        </pre>
      </div>
      <p className="text-muted-foreground">
        Bản xem trước giới hạn 200 ký tự lệnh / 400 ký tự đầu ra; lọc mẫu thông
        tin nhạy cảm.{preview.truncated ? " Nội dung đã rút gọn." : ""}
      </p>
    </div>
  );
}
