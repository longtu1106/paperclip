# Paperclip native Windows - PC nhà và PC công ty

Cập nhật 15/10/2026. Source chính: `E:\ProjectVNG\paperclip`, fork `https://github.com/longtu1106/paperclip.git`, nhánh `dev/windows-local`. Upstream chính chủ: `https://github.com/paperclipai/paperclip.git`.

## Mô hình đã chọn

- Mỗi PC chạy Node/Paperclip và Codex/Claude CLI ngay trên Windows, bằng user đăng nhập. Không cần WSL, Docker hoặc SSH về PC để thực thi.
- Dashboard: `http://localhost:3100`. Đây là profile local-only, không public hoặc đưa qua proxy khi chưa chuyển sang chế độ có đăng nhập.
- Dữ liệu mới nằm tại `data/windows-home/instances/default/`; DB embedded PostgreSQL dùng port `54339`, khác DB local cũ.
- Source, role templates và skill tùy chỉnh được Git quản lý. Database, login, secret, log, backup và cấu hình project của từng PC không được Git quản lý.
- Không chuyển lịch sử/DB/credential từ VPS. Instance cũ và VPS được giữ nguyên; user sẽ tự quyết định xóa VPS sau.
- Hai PC dùng cùng phiên bản code nhưng có task, tài khoản và project độc lập. Git không đồng bộ hai dashboard.

## Chuẩn bị ở PC công ty

PowerShell thường, không cần Administrator. Cần Node >=24.11, Git và CLI native của provider sẽ dùng. `claude.exe` thường ở `%USERPROFILE%\.local\bin`. Git Bash vẫn có thể cần cho Claude Code; không phải WSL.

```powershell
# Lần đầu: lấy nhánh Windows từ fork của bạn.
git clone --branch dev/windows-local https://github.com/longtu1106/paperclip.git E:\ProjectVNG\paperclip
cd E:\ProjectVNG\paperclip

# Cài đúng pnpm theo packageManager; không dùng bản global 9.4.
npx.cmd --yes pnpm@9.15.4 install --frozen-lockfile

# Tạo profile riêng và giới hạn ACL dữ liệu local.
node scripts/windows-local.mjs setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows-local-protect.ps1

# Cài Codex CLI đúng bản pin, riêng cho Paperclip.
node scripts/windows-local-codex.mjs install

# Kiểm tra CLI, cấu hình, port; chạy server nền ở chế độ bảo trì ban đầu.
node scripts/windows-local.mjs doctor
node scripts/windows-local.mjs start
node scripts/windows-local.mjs status

# Sau khi health=ok, nhập skill và tạo 3 role mới ở trạng thái Pause.
node scripts/windows-local-bootstrap.mjs --team
```

`bootstrap` chỉ gọi API localhost của đúng profile đang quản lý, không chạy agent hoặc gọi model. Chạy lại giữ nguyên agent và không tạo trùng skill. Skill đã sửa khác trên dashboard cần đối chiếu trước khi thay thế. Tài khoản OpenAI/Claude phải đăng nhập lại trên máy này, qua tab Runtime/Connection của agent; không copy auth.json, cookie hoặc token từ máy khác.

## Lệnh vận hành và ý nghĩa

Chạy ở thư mục source. Có các alias `pnpm windows:start`, `windows:stop`, `windows:status`, `windows:doctor`, `windows:backup`; lệnh Node bên dưới không phụ thuộc phiên bản pnpm global.

```powershell
# Bật nền; nếu đúng instance đã chạy thì không khởi tạo bản thứ hai.
node scripts/windows-local.mjs start

# Kiểm tra liveness và health thật; starting=true chưa có nghĩa ready.
node scripts/windows-local.mjs status

# Dừng nhẹ qua shutdown API nội bộ của server; dừng DB sau cleanup.
node scripts/windows-local.mjs stop

# Backup đầy đủ instance Windows khi server đã dừng.
node scripts/windows-local.mjs backup

# Sau khi bootstrap xong: cho phép thực thi; 3 agent vẫn Pause.
node scripts/windows-local.mjs execution on
node scripts/windows-local.mjs start

# Tự bật sau khi user đăng nhập Windows.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows-local-startup.ps1

# Tắt tự bật nếu không cần.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows-local-startup.ps1 -Action Disable
```

Lệnh `execution on/off` cần server dừng trước. Chế độ bảo trì (`off`) dùng để bootstrap/cấu hình mà không chạy task; nó không thay thế Pause từng agent. Startup là tác vụ sau đăng nhập, không phải Windows service trước login hoặc cam kết hoạt động khi PC ngủ/tắt. Nếu server crash, kiểm tra log và chạy start lại; chưa có supervisor tự retry vô hạn.

Log riêng ở `data/windows-home/windows-runtime/`. Không gửi nguyên log chứa credential vào chat. `stop` không dùng taskkill/kill postgres.exe; nếu quá thời gian chờ thì báo để kiểm tra, không ép tắt process khác. Khi source HEAD đổi, start tạo một backup offline trước khi server áp migration. Với sửa migration chưa commit, chủ động backup trước khi chạy.

Backup filesystem ở `data/windows-backups/`, có DB, config, storage, agent files và master key. Đây là backup Windows của đúng instance; không phải định dạng di chuyển PostgreSQL giữa Linux/Windows. Không commit/upload backup. Chưa kiểm chứng phục hồi thảm họa; nên giữ thêm bản sao riêng ở nơi được bảo vệ.

## Skill, vai trò và quyền

- Skill built-in `paperclip` do runtime cung cấp; không tắt hoặc tạo bản copy thứ hai. Upstream hiện cũng gán `complain` và `suggestion-box` theo runtime defaults.
- Skill tùy chỉnh `ifixai-audit` được nhập từ `local-config/skills/ifixai-audit/SKILL.md`. Đã sửa chỉ dẫn runtime Windows; chưa cài engine iFixAi/adapter cho Windows, chưa chạy audit live.
- Hướng dẫn nhóm nằm tại `local-config/agent-roles/`. Culi 1 điều phối, Culi 2 lập trình, Culi 3 review/kiểm thử. Các bản này đã dùng trên VPS; không mang theo ID hay tài khoản VPS.
- Agent mới: `codex_local`, engine `cli`, model cấu hình `gpt-6.1-sol`, sandbox read-only, bypass=false, Pause và heartbeat tự động tắt. Mỗi tài khoản cần login/test riêng trước khi chạy.
- Chọn đúng project và cwd local rồi cấp workspace-write cho task lập trình/build/test cần ghi. Không bật full access toàn PC để chữa lỗi đường dẫn.
- MCP, skill Codex/Claude Desktop, Google Drive và quyền ADB không tự được thừa kế. Mỗi project cần cấu hình và kiểm chứng riêng. Chưa chạy task DatVietMap hoặc sửa source app trong bước này.

## Codex CLI riêng cho Paperclip

Profile Windows dùng bản ổn định `0.162.1`, được pin trong `local-config/windows-tools.json`. Binary và tài nguyên cài ở `data/windows-tools/codex-0.162.1/`, không đưa vào Git. PATH của riêng server ưu tiên bản này; không sửa PATH Windows hoặc CLI của Desktop.

```powershell
# Sau clone/pull khi pin CLI thay đổi: cài đúng phiên bản, không cài global.
node scripts/windows-local-codex.mjs install

# Khi không có task đang chạy: restart để server nhận PATH mới.
node scripts/windows-local.mjs stop
node scripts/windows-local.mjs start
node scripts/windows-local.mjs doctor
```

Alias cài đặt là `pnpm windows:codex-install`. Lệnh chạy lại sẽ kiểm tra và tái dùng đúng bản đã cài. `doctor` cần hiện `managedCodex.installed=true` và `codex-cli 0.162.1`. Nếu thiếu package hoặc sai phiên bản/layout, start yêu cầu cài lại thay vì âm thầm dùng CLI cũ. Các phiên bản đã cài được giữ riêng để đối chiếu; không tự cập nhật CLI mỗi lần khởi động.

Ngày 15/10/2026, cùng tài khoản Minh Nguyen: CLI cũ `0.157.1` không có `gpt-6.1-sol`; CLI `0.162.1` có model này và kiểm tra `codex_hello_probe_passed` qua API Paperclip đã PASS. Receipt local: `data/windows-home/windows-runtime/model-6.1-test.json`. Model còn phụ thuộc tài khoản; ở máy khác vẫn phải đăng nhập và Test connection. Nếu form Runtime đang báo lỗi cũ, bấm Test lại rồi Save changes. Phép thử không đổi model, account, sandbox hoặc trạng thái Pause của agent.

Phần này dành cho execution engine `Codex CLI`. Engine ACP có dependency riêng của upstream. Khi chủ động nâng tiếp CLI, sửa pin bằng commit riêng, cài bản đó, kiểm tra doctor/model/hello và restart khi task đã kết thúc; không trỏ cố định vào thư mục alpha có mã hash của Desktop.

## Dùng Git để chỉnh sửa và cập nhật

`origin` là fork của bạn. `upstream` là repo chính chủ. PC công ty chỉ cần clone/pull nhánh Windows từ origin; mỗi máy tự đăng nhập provider và giữ data local.

```powershell
# Lấy thay đổi Windows đã được bạn đẩy từ PC khác.
git switch dev/windows-local
git pull --ff-only origin dev/windows-local

# Xem thay đổi upstream, chưa trộn code.
git remote -v
git fetch upstream master
git log --oneline HEAD..upstream/master -n 20
```

Nếu clone lần đầu chưa có upstream:

```powershell
git remote add upstream https://github.com/paperclipai/paperclip.git
```

Trước khi nâng phiên bản, kết thúc task đang chạy, stop và backup local; giữ working tree sạch bằng commit có chọn lọc cho thay đổi muốn giữ. Không reset --hard hoặc stash tự động. Tạo nhánh tích hợp để thử merge upstream thay vì merge trực tiếp vào nhánh Windows đang dùng:

```powershell
node scripts/windows-local.mjs stop
node scripts/windows-local.mjs backup
git status --short
git switch -c integration/upstream-YYYYMMDD
git merge upstream/master
npx.cmd --yes pnpm@9.15.4 install --frozen-lockfile
node --test scripts/windows-local.test.mjs scripts/link-plugin-dev-sdk.test.js
```

Giải quyết conflict theo source thực tế, chạy test login Windows, health/UI và kiểm tra liên quan. Chỉ sau khi xác minh mới merge nhánh tích hợp về `dev/windows-local` và push. Sau nâng schema, rollback cần cả backup DB/config/key tương thích; chỉ checkout commit cũ không hoàn tác migration DB.

Không cài upstream mới hoặc auto-pull mỗi lần bật máy. Lần rà soát này đã fetch upstream (384 commit mới ở thời điểm kiểm tra) nhưng chưa merge vào bản đang xác minh. Nền source vẫn `083073703086dd699f3f2bfd852e56c7150c2d09` cùng các patch Windows của fork.

Khi chỉnh tính năng của Paperclip: UI được Vite cập nhật trong lúc phát triển; đổi backend cần stop/start profile Windows sau khi task đang chạy kết thúc. Dùng nhánh tính năng riêng từ `dev/windows-local`, commit source có chọn lọc và push để PC còn lại pull. Không dùng hai server đồng thời trên cùng data directory. Không dùng `pnpm dev` mặc định nếu muốn giữ đúng profile Windows này.

## Phạm vi đã kiểm chứng

- Native Node server, UI qua Vite middleware, PostgreSQL Windows, health và local login capability hoạt động trên PC nhà.
- Đã kiểm tra shutdown, khởi động lại và tạo backup offline. Bootstrap lặp lại không tạo trùng company/skill/3 agent.
- Các test login Windows và SDK junction được chạy riêng; xem receipt trong `data/windows-home/windows-runtime/verification.json`.
- Chưa chứng nhận toàn bộ monorepo `pnpm build` trên Windows. Pipeline release/Rust native Runner và một số build scripts upstream vẫn có phụ thuộc riêng; profile này dùng direct CLI adapters và tắt Experimental Native Runner.
- Đã kiểm tra danh sách model và hello GPT-6.1 Sol với connection Minh Nguyen bằng CLI 0.162.1, không tạo task hoặc sửa source project. 15 test Node cho profile Windows/CLI/SDK junction đã đạt. Chưa xác minh mọi tài khoản, MCP hoặc project công ty; những việc này thực hiện trên từng PC.
