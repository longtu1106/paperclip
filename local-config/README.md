# Cấu hình dùng chung PC nhà và PC công ty

Nguồn Git chỉ chứa hướng dẫn vai trò và skill; mỗi máy giữ database, tài khoản AI, MCP credentials và đường dẫn project riêng trong `data/windows-home/` (đã được Git bỏ qua).

- `agent-roles/common.md`: quy tắc chung của nhóm đã dùng trên VPS.
- `agent-roles/coordinator.md`: Culi 1 điều phối/kiến trúc.
- `agent-roles/developer.md`: Culi 2 lập trình.
- `agent-roles/reviewer-qa.md`: Culi 3 review/kiểm thử.
- `skills/ifixai-audit/SKILL.md`: skill tùy chỉnh từ VPS, sửa phần runtime để dùng trên Windows. Chưa cài engine/adapter iFixAi cho Windows.
- `windows-tools.json`: pin Codex CLI native ổn định, dùng riêng cho profile Windows. Sau clone/pull chạy `node scripts/windows-local-codex.mjs install`; binary chỉ lưu trong `data/windows-tools/`, không đồng bộ credential qua Git.

Các skill Paperclip built-in đã nằm trong repo upstream, không copy bản thứ hai. VNG single/complicate và MCP Desktop chưa được tự động nhập; lựa chọn các skill chuyên môn vẫn do user quản lý trên Paperclip.

Chạy `node scripts/windows-local-bootstrap.mjs` để tạo hoặc tái dùng company `Longtu Local` và nhập skill `ifixai-audit` vào thư viện. Lệnh không chạy agent, không tạo task và không ghi đè skill đã được sửa khác trên dashboard. Receipt chỉ ở dữ liệu local, không đưa vào Git.

Tùy chọn `--team` tạo thêm ba agent theo templates nếu company cho phép tạo trực tiếp. Nếu có yêu cầu duyệt tuyển agent, script dừng ở chính sách đó. Agent mới sẽ được pause, CLI sandbox read-only và không có credential. Sau khi kết nối tài khoản, chọn project/quyền phù hợp trước khi resume. Không tự mở quyền toàn ổ đĩa.

Nếu có nhiều company, truyền `--company-id UUID` để chọn rõ. Trước khi chạy lại bootstrap sau khi cập nhật Git, so sánh các chỉnh sửa skill trên dashboard với bản source. Sửa vai trò trong Git chưa tự thay instructions của agent đã tồn tại; script giữ nguyên agent cũ.
