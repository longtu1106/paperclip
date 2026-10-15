# MCP trên Paperclip Windows local

Cập nhật 16/10/2026. Dashboard local: http://localhost:3100. Các account OpenAI đang kết nối chỉ cung cấp model; chúng không đồng thời kết nối Gortex, database hoặc browser.

## Kiểm kê PC nhà

Đã đọc metadata cấu hình local, không xuất credential:

- Codex có Gortex (stdio), Playwright (stdio), Mantine (stdio), Stitch (HTTP có header xác thực) và node_repl của Desktop.
- Claude có Gortex (stdio). Chưa thấy Plane hoặc MQLens trong các cấu hình global đã kiểm tra; plugin/project khác hoặc PC công ty có thể có cấu hình riêng.
- node_repl hiện dùng pipe và runtime có mã hash của Desktop. Không copy nguyên cấu hình đó sang agent chạy nền.
- Thư viện skill và MCP connection là hai phần riêng. Import skill Gortex không tạo Gortex MCP, và skill database không tự cấp quyền database.

## MCP HTTP hoặc SSE

Trong Connectors/Apps, dùng luồng kết nối MCP bằng URL hoặc Advanced → Paste a config. Bản source hiện hỗ trợ parse JSON dạng `mcpServers` rồi kiểm tra/kích hoạt remote HTTP draft.

1. Chọn đúng URL MCP từ cấu hình/documentation của server đang dùng.
2. Nhập token/API key bằng luồng credential của Paperclip hoặc hoàn tất OAuth. Không dán token vào Instructions, Extra args, Git hay chat.
3. Kiểm tra kết nối và danh sách tool thật trả về.
4. Gán connection/quyền cho agent cần dùng trong Tools. Kiểm tra bằng thao tác chỉ đọc trước.
5. Với MQLens, xác định rõ database dev/test và scope quyền trước khi cho Culi 2/3 seed hoặc sửa record. Với tài nguyên chỉ có trong VPN công ty, tiến hành trên PC công ty khi VPN hoạt động.

## MCP stdio local

Ví dụ Gortex có thể dùng cấu trúc JSON sau, với executable đúng trên từng PC:

```json
{
  "mcpServers": {
    "gortex": {
      "command": "C:/Users/nnm23/AppData/Local/Programs/gortex/gortex.exe",
      "args": ["mcp"]
    }
  }
}
```

Đã gọi preview import thật: Gortex được nhận diện là `local_stdio`, HTTP 200. Nhưng bản Paperclip hiện giữ command stdio ở trạng thái draft cho đến khi được map vào template được hỗ trợ. Preview thành công chưa phải connection hoạt động. Danh sách template đã kiểm tra chưa có Gortex/Playwright/Mantine. Bước tích hợp tiếp theo cần bổ sung hoặc chọn template stdio hợp lệ, rồi kiểm tra tool discovery và gán quyền agent; không bỏ qua gate này.

Không đưa toàn bộ config.toml/.claude.json của Desktop vào provider home để chữa lỗi. Profile subscription có CODEX_HOME riêng và giữ cách ly auth. Extra args `-c/--config` tự nhập cũng bị managed connection chặn; đây không phải cách nối MCP trong profile này.

## Thứ tự nối đề xuất

Nối Gortex cho khám phá/review code; Playwright cho kiểm tra UI web; sau đó MQLens và Plane bằng cấu hình đúng máy/project. Stitch/Mantine dùng khi task UI cần. Mỗi connection phải có bằng chứng list-tools và một thao tác chỉ đọc; không báo đã dùng được chỉ vì skill xuất hiện.

Gortex hiện chỉ track các repo Bakery trên máy. Repo chưa có graph vẫn dùng file fallback theo quy tắc nhóm; không tự track repo hoặc restart daemon để vượt qua giới hạn coverage.
