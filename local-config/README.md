# Cấu hình dùng chung PC nhà và PC công ty

Nguồn Git chỉ chứa hướng dẫn vai trò và skill; mỗi máy giữ database, tài khoản AI, MCP credentials và đường dẫn project riêng trong `data/windows-home/` (đã được Git bỏ qua).

Setup và prompt bàn giao dành cho Codex trên PC công ty: [WINDOWS-COMPANY-SETUP.md](../doc/WINDOWS-COMPANY-SETUP.md).

- `agent-roles/common.md`: quy tắc chung của nhóm đã dùng trên VPS.
- `agent-roles/coordinator.md`: Culi 1 điều phối/kiến trúc.
- `agent-roles/developer.md`: Culi 2 lập trình.
- `agent-roles/reviewer-qa.md`: Culi 3 review/kiểm thử.
- `skills/ifixai-audit/SKILL.md`: skill tùy chỉnh từ VPS, sửa phần runtime để dùng trên Windows. Chưa cài engine/adapter iFixAi cho Windows.
- `windows-tools.json`: pin Codex CLI native ổn định, dùng riêng cho profile Windows. Sau clone/pull chạy `node scripts/windows-local-codex.mjs install`; binary chỉ lưu trong `data/windows-tools/`, không đồng bộ credential qua Git.

Ngày 16/10/2026, user cho phép nhập 33 skill cá nhân (ưu tiên Codex khi trùng Claude), thêm quy tắc đọc docs/cách xưng hô mày–tao, và truy cập C:/E: bằng quyền user Windows. Dùng `node scripts/windows-local-context.mjs` để xem trước, thêm `--apply` để nhập và áp dụng cho ba agent idle/paused của Longtu Local. Script kiểm tra đọc docs trong sandbox Windows restricted-token trước, giữ bản gốc và mọi agent/account/model hiện hữu, bảo lưu instructions cũ bằng block được đánh dấu, so sánh hash để không ghi đè skill đã sửa khác trên dashboard, và tạo backup/receipt local.

Bản sao đủ 71 file skill cá nhân nằm trong dữ liệu company local, không được publish lên GitHub. Sau pull trên PC công ty, script đọc bộ skill có sẵn tại `%USERPROFILE%/.codex/skills`, `.agents/skills`, `.claude/skills` của chính máy đó. Plugin/system skills không nằm trong đợt nhập 33 skill đã được chốt. MCP là bước tích hợp riêng, xem `../doc/WINDOWS-MCP.md`.

Các skill Paperclip built-in đã nằm trong repo upstream, không copy bản thứ hai. Helper context nhập VNG single/complicate khi thư mục skill có trên máy này; MCP Desktop vẫn cần kết nối và kiểm chứng riêng. Các skill chuyên môn có thể được user quản lý thêm trên Paperclip.

Chạy `node scripts/windows-local-bootstrap.mjs` để tạo hoặc tái dùng company `Longtu Local` và nhập skill `ifixai-audit` vào thư viện. Lệnh không chạy agent, không tạo task và không ghi đè skill đã được sửa khác trên dashboard. Receipt chỉ ở dữ liệu local, không đưa vào Git.

Tùy chọn `--team` tạo thêm ba agent theo templates nếu company cho phép tạo trực tiếp. Nếu có yêu cầu duyệt tuyển agent, script dừng ở chính sách đó. Agent mới sẽ được pause, CLI sandbox read-only và không có credential. Sau khi kết nối tài khoản, chọn project/quyền phù hợp trước khi resume. Không tự mở quyền toàn ổ đĩa.

Nếu có nhiều company, truyền `--company-id UUID` để chọn rõ. Trước khi chạy lại bootstrap sau khi cập nhật Git, so sánh các chỉnh sửa skill trên dashboard với bản source. Sửa vai trò trong Git chưa tự thay instructions của agent đã tồn tại; script giữ nguyên agent cũ.
