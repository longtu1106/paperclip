# Paperclip server riêng — phát triển trên PC, chạy trên VPS

Source: `E:\ProjectVNG\paperclip-server`, nhánh `dev/server`, fork `longtu1106/paperclip`.
Baseline trước thay đổi: `467125fafb47a8520856504fecc48d6e32055db1` (bản VPS đang chạy).
Clone Windows cũ `E:\ProjectVNG\paperclip` được giữ riêng.

## 1. Source thay đổi đến VPS như thế nào?

1. Sửa source trên PC, kiểm thử chức năng thay đổi, commit và push vào `dev/server`.
2. Workflow **Server image (personal VPS)** build Docker target `production`, Linux amd64.
3. CI khởi động image với PostgreSQL và volume hoàn toàn mới, kiểm tra migrations, health,
   commit và hai executable Codex/Claude. Không gọi agent hoặc dùng subscription thật.
4. Chỉ khi smoke test qua, image ứng dụng mới được push vào
   `ghcr.io/longtu1106/paperclip-server:sha-<commit>`. Registry cache được xuất trong build.
5. Lấy **digest và commit** trong Summary của workflow rồi chạy updater trên VPS.
   CI không có khóa SSH và không tự đổi production.

VPS hiện vẫn dùng image upstream. Việc tạo các file này chưa đổi image đang chạy.
Smoke trên database mới không chứng minh migration từ dữ liệu production đã an toàn;
release có migration cần thử trên bản sao backup trong môi trường riêng trước khi cập nhật.
Dockerfile upstream cài CLI `@latest` theo tuần; source commit giống nhau không đảm bảo
hai lần build có cùng CLI. Digest xác định chính xác image được triển khai.

## 2. Đưa workflow lên fork lần đầu (PowerShell PC nhà)

```powershell
cd E:\ProjectVNG\paperclip-server
git status --short
git diff --check
git push -u origin dev/server
```

Lệnh push yêu cầu máy đã đăng nhập GitHub và commit đã được tạo. Nếu Git đang báo
`credential-manager` không tồn tại, có thể dùng GitHub Desktop: Add local repository,
chọn thư mục trên, đăng nhập `longtu1106`, Publish branch. Không nhập token vào chat.
Không push `master` hoặc force-push.

Trong GitHub mở repository → Actions. Nếu fork đang tắt Actions, bật Actions rồi
chạy lại push hoặc chọn Re-run jobs nếu đã có run. Workflow mới trên `dev/server`
chạy bằng push; nút Run workflow có thể chưa xuất hiện khi file chưa ở default branch.
Chờ workflow xanh và mở Summary. Build đầu có thể lâu; không build trên VPS 35 GB.

Package GHCR mới thường private. Với source fork public này, có thể vào GitHub profile
→ Packages → `paperclip-server` → Package settings → Change visibility → Public để
VPS pull không cần token. Cache package cũng nằm cùng package này. Nếu giữ private,
đăng nhập GHCR trên VPS bằng PAT classic có `read:packages`, nhập tương tác vào
`sudo docker login ghcr.io -u longtu1106`, không lưu token vào repo/lệnh trong tài liệu.

## 3. Chuyển script lên VPS (PowerShell PC nhà)

Thư mục VPS đã có `.env`, `public.env`, compose và Caddyfile đang hoạt động.
Lần đầu chỉ copy script mới, không ghi đè cấu hình/secret production.

```powershell
$deploySource = 'E:\ProjectVNG\paperclip-server\deploy\vps'
scp -i "$env:USERPROFILE\.ssh\paperclip_hosthatch" `
  "$deploySource\common.sh" "$deploySource\backup.sh" `
  "$deploySource\update-image.sh" "$deploySource\public-compose.sh" `
  paperclip@167.104.101.135:apps/paperclip-deploy/
```

## 4. Backup và cập nhật (SSH Ubuntu, user paperclip)

Trước khi cập nhật, kết thúc/dừng các run quan trọng. Backup cần dừng ứng dụng ngắn;
database và Caddy tiếp tục chạy. Có thể backup độc lập trước khi có image mới:

```bash
cd ~/apps/paperclip-deploy
bash backup.sh
```

Script lưu database dump, archive `/paperclip`, cấu hình và `.env` tại
`~/backups/paperclip-before-update-...`, quyền thư mục 700. Nó kiểm tra cấu trúc dump/archive
và khởi động lại container gốc kể cả khi backup thất bại. Chưa phải kiểm chứng restore.
Chỉ một backup/update được chạy tại cùng thời điểm.

Sau CI xanh, copy nguyên lệnh **thật** trong workflow Summary, ví dụ hình thức:

```bash
bash update-image.sh ghcr.io/longtu1106/paperclip-server@sha256:<DIGEST_THAT> <COMMIT_THAT>
```

Không chạy nguyên placeholder trên. Updater pull trước, kiểm tra platform/source/commit,
backup, đổi duy nhất `PAPERCLIP_IMAGE` trong `.env`, rồi recreate **chỉ ứng dụng**.
Không dùng `down -v`. Health qua HTTPS phải trả commit mới, authenticated/public.
Migrations có thể được áp dụng khi ứng dụng khởi động. Nếu bước cuối thất bại, giữ
backup và báo lỗi; không tự đổi image cũ ngược lại vì database có thể đã đổi schema.
Rollback cần đánh giá migration và có thể phải restore đồng bộ DB + volume + config
từ cùng backup. Không xóa backup hoặc image cũ trước khi kiểm tra login/dữ liệu thành công.

```bash
bash public-compose.sh ps
bash public-compose.sh logs --tail=80 paperclip caddy
curl -fsS https://agents.culi4life.party/api/health
sudo systemctl is-enabled docker
```

Ý nghĩa: xem container/logs, kiểm tra HTTPS/commit và Docker được bật khi boot.
Restart policy `unless-stopped` giữ dịch vụ sau đóng SSH; container đã stop thủ công
cần start lại. Cần kiểm chứng reboot có kế hoạch riêng. Giữ HTTPS 80/443 và SSH;
không mở PostgreSQL hoặc app port 3100 trực tiếp Internet.

## 5. Tải backup ra ngoài VPS (PowerShell)

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\Downloads\PaperclipBackups" | Out-Null
scp -i "$env:USERPROFILE\.ssh\paperclip_hosthatch" -r `
  'paperclip@167.104.101.135:backups/paperclip-before-update-*' `
  "$env:USERPROFILE\Downloads\PaperclipBackups\"
```

Backup chứa credential, giữ riêng ngoài Git. Tần suất/retention backup ngoài VPS chưa
được tự động hóa bởi các script này; theo dõi dung lượng đĩa trước các release tiếp theo.

## 6. Nhận update upstream về sau

Clone hiện shallow; trước khi merge lịch sử cần lấy thêm history:

```powershell
cd E:\ProjectVNG\paperclip-server
git status --short
git fetch --unshallow upstream
git fetch upstream master
git switch -c upgrade/upstream-review dev/server
git merge upstream/master
```

Chỉ merge khi working tree sạch; `--unshallow` chỉ cần khi repo còn shallow.
Review thay đổi, giải quyết conflicts, test rồi mới merge nhánh upgrade vào dev/server,
build image và cập nhật VPS bằng quy trình trên. Không tự pull upstream vào production.

Nguồn: https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images
và https://docs.docker.com/build/ci/github-actions/test-before-push/
