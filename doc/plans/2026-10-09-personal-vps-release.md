# Personal VPS release workflow

Scope: only fork build/deployment infrastructure. Keep the upstream application and
existing Windows clone unchanged. Baseline matches the working VPS commit
467125fafb47a8520856504fecc48d6e32055db1.

- Build only production Linux amd64 on dev/server pushes in longtu1106/paperclip.
- Use GITHUB_TOKEN for GHCR; no production credentials/SSH keys in Actions.
- Smoke a fresh isolated authenticated database before publishing application image.
- Promote manually by digest + exact source commit after reviewing release/migrations.
- Preserve production secrets, Compose project and volume identities.
- Backup DB + application home + deployment config while application is stopped;
  restart original container if backup fails. Serialize backup/update with flock.
- Never automatically roll back across a potentially changed database schema.

Verification: Bash syntax, YAML/Compose checks and fake-Docker failure-path tests.
Full image CI and real VPS deployment are separate evidence; do not claim completed
until the workflow ran and the deployed HTTPS health reports the new commit.
Fresh-DB smoke is not an upgrade/restore rehearsal. Continuous production backup
offsite/retention, runner connections and Plane/MQLens integration remain later work.
