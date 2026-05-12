/**
 * 从 yxzn-lib 仓库的 `skills-dist` 同步 skill 到 `skills/yxzn-lib/`。
 *
 * 用法:
 *   pnpm sync:yxzn-lib
 *   node scripts/sync-yxzn-lib.ts --ref main
 *
 * 配置（勿提交 `yxzn-lib-sync.auth.json`，见 .gitignore）:
 *   复制 `yxzn-lib-sync.auth.example.json` 为 `yxzn-lib-sync.auth.json`，至少填写：
 *   - `repositoryUrl` — 仓库 HTTPS 根地址（必须 `https://`，不要嵌入账号密码）
 *   若设置环境变量 `YXZN_LIB_GIT_URL`，则以其覆盖文件中的 `repositoryUrl`（文件可只保留 username/password）。
 *   私有库填写 `username` / `password`（GitLab 建议 PAT 作为 password）；公开库可省略二者。
 *
 * 环境变量:
 *   YXZN_LIB_GIT_URL — 若设置，覆盖凭据文件中的 `repositoryUrl`
 *   YXZN_LIB_AUTH_FILE — 凭据 JSON 路径（默认项目根目录 `yxzn-lib-sync.auth.json`）
 *   YXZN_LIB_SYNC_VERBOSE=1 — 打印临时克隆路径与删除结果（默认静默）
 *
 * 临时目录:
 *   `git clone` 落在本机系统临时目录下，形如 `{os.tmpdir()}/yxzn-lib-skill-sync-XXXXXX/repo`，
 *   不在本仓库内。脚本在 finally 中整目录删除该父级 `yxzn-lib-skill-sync-*`（成功或失败都会清理）。
 *
 * SYNC.md:
 *   仅记录同步时的 Git SHA 与日期，不包含仓库地址或 Source。
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const DEFAULT_AUTH_FILE = 'yxzn-lib-sync.auth.json'
const SOURCE_DIR = 'skills-dist'
const OUTPUT_SKILL = 'yxzn-lib'

const RE_BACKSLASH_TO_SLASH = /\\/g
const RE_LEADING_SLASH = /^\//
const RE_REL_PATH_LEADING_SEP = /^[/\\]/
const RE_TRAILING_SLASH = /\/$/
const RE_SAFE_GIT_REF = /^[\w./-]+$/
const RE_HTTPS_GIT_URL = /^https:\/\/([^/]+)(\/.*)$/i
/** 掩码 https://user:pass@ → https://***:***@ */
const RE_HTTPS_USERINFO_PREFIX = /^(https:\/\/)[^@]+(@)/i

interface SyncAuthFile {
  repositoryUrl?: string
  username?: string
  password?: string
}

function cloneUrl(raw: string): string {
  const t = raw.replace(RE_TRAILING_SLASH, '')
  return t.endsWith('.git') ? t : `${t}.git`
}

/** 仅支持 https://，将 user:pass 注入到主机名前（密码中含特殊字符会 encode） */
function httpsUrlWithBasicAuth(httpsUrl: string, username: string, password: string): string {
  const raw = httpsUrl.replace(RE_TRAILING_SLASH, '')
  const withGit = raw.endsWith('.git') ? raw : `${raw}.git`
  const m = withGit.match(RE_HTTPS_GIT_URL)
  if (!m) {
    throw new Error(
      '克隆地址需为 https:// 格式（请检查 repositoryUrl 或 YXZN_LIB_GIT_URL）',
    )
  }
  const host = m[1]
  const path = m[2]
  const u = encodeURIComponent(username)
  const p = encodeURIComponent(password)
  return `https://${u}:${p}@${host}${path}`
}

function maskCredentialsInUrl(url: string): string {
  return url.replace(RE_HTTPS_USERINFO_PREFIX, '$1***:***$2')
}

function readSyncAuthFile(filePath: string): SyncAuthFile {
  const text = readFileSync(filePath, 'utf-8')
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  }
  catch {
    throw new Error(`凭据文件不是合法 JSON: ${filePath}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`凭据文件格式错误（应为对象）: ${filePath}`)
  }
  const o = parsed as Record<string, unknown>
  const repositoryUrlRaw = o.repositoryUrl
  let repositoryUrl: string | undefined
  if (repositoryUrlRaw !== undefined && repositoryUrlRaw !== null && String(repositoryUrlRaw).trim()) {
    if (typeof repositoryUrlRaw !== 'string') {
      throw new TypeError(`repositoryUrl 须为字符串: ${filePath}`)
    }
    repositoryUrl = repositoryUrlRaw.trim()
    if (!repositoryUrl.toLowerCase().startsWith('https://')) {
      throw new TypeError(`repositoryUrl 必须以 https:// 开头: ${filePath}`)
    }
  }
  const username = o.username
  const password = o.password
  const hasUser = username !== undefined && username !== null && String(username).length > 0
  const hasPass = password !== undefined && password !== null && String(password).length > 0
  if (hasUser !== hasPass) {
    throw new TypeError(`username 与 password 需同时填写或同时省略: ${filePath}`)
  }
  if (hasUser) {
    if (typeof username !== 'string' || typeof password !== 'string') {
      throw new TypeError(`username、password 须为字符串: ${filePath}`)
    }
    if (!username) {
      throw new Error(`username 不能为空: ${filePath}`)
    }
    return { repositoryUrl, username, password }
  }
  return { repositoryUrl }
}

function parseRefArg(): string | undefined {
  const idx = process.argv.indexOf('--ref')
  if (idx === -1)
    return undefined
  const ref = process.argv[idx + 1]
  if (!ref || ref.startsWith('-')) {
    console.error('缺少 --ref 的值，例如: --ref main')
    process.exit(1)
  }
  if (!RE_SAFE_GIT_REF.test(ref)) {
    console.error(`不安全的 git ref: ${ref}`)
    process.exit(1)
  }
  return ref
}

function runGit(args: string[], cwd: string): void {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim()
    throw new Error(err || `git ${args.join(' ')} 失败（退出码 ${r.status}）`)
  }
}

function gitRevParse(repoDir: string): string | null {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf-8' })
  if (r.status !== 0)
    return null
  return (r.stdout ?? '').trim() || null
}

function shouldSkipRelPath(rel: string): boolean {
  const norm = rel.replace(RE_BACKSLASH_TO_SLASH, '/').replace(RE_LEADING_SLASH, '')
  const segments = norm.split('/')
  return segments.includes('.git') || segments.includes('node_modules')
}

function copySkillTree(sourceSkillPath: string, outputPath: string): void {
  if (existsSync(outputPath))
    rmSync(outputPath, { recursive: true })
  mkdirSync(outputPath, { recursive: true })

  const files = readdirSync(sourceSkillPath, { recursive: true, withFileTypes: true })
  for (const file of files) {
    if (!file.isFile())
      continue
    const fullPath = join(file.parentPath, file.name)
    const relativePath = fullPath.replace(sourceSkillPath, '').replace(RE_REL_PATH_LEADING_SEP, '')
    if (shouldSkipRelPath(relativePath))
      continue
    const destPath = join(outputPath, relativePath)
    const destDir = dirname(destPath)
    if (!existsSync(destDir))
      mkdirSync(destDir, { recursive: true })
    cpSync(fullPath, destPath)
  }
}

function copyLicenseFromRepo(repoRoot: string, outputPath: string): void {
  const licenseNames = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'license.txt']
  for (const licenseName of licenseNames) {
    const licensePath = join(repoRoot, licenseName)
    if (existsSync(licensePath)) {
      cpSync(licensePath, join(outputPath, 'LICENSE.md'))
      break
    }
  }
}

function main(): void {
  const authPath = process.env.YXZN_LIB_AUTH_FILE ?? join(root, DEFAULT_AUTH_FILE)
  const envUrl = process.env.YXZN_LIB_GIT_URL?.trim()

  if (envUrl && !envUrl.toLowerCase().startsWith('https://')) {
    console.error('YXZN_LIB_GIT_URL 必须以 https:// 开头')
    process.exit(1)
  }

  let auth: SyncAuthFile | undefined
  if (existsSync(authPath)) {
    try {
      auth = readSyncAuthFile(authPath)
    }
    catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  }

  const displayUrl = (envUrl ?? auth?.repositoryUrl)?.trim()
  if (!displayUrl) {
    console.error(
      `请在本机创建 ${DEFAULT_AUTH_FILE} 并填写 repositoryUrl（参考 yxzn-lib-sync.auth.example.json），或设置环境变量 YXZN_LIB_GIT_URL。`,
    )
    process.exit(1)
  }
  if (!displayUrl.toLowerCase().startsWith('https://')) {
    console.error('仓库地址必须以 https:// 开头')
    process.exit(1)
  }

  let cloneTargetUrl = cloneUrl(displayUrl)
  let logUrl = cloneTargetUrl
  if (auth?.username && auth?.password) {
    try {
      cloneTargetUrl = httpsUrlWithBasicAuth(displayUrl, auth.username, auth.password)
      logUrl = maskCredentialsInUrl(cloneTargetUrl)
    }
    catch (e) {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    }
  }

  const ref = parseRefArg()

  const tempRoot = mkdtempSync(join(tmpdir(), 'yxzn-lib-skill-sync-'))
  const repoDir = join(tempRoot, 'repo')
  const verbose = process.env.YXZN_LIB_SYNC_VERBOSE === '1'

  if (verbose)
    console.log(`临时克隆目录: ${repoDir}（脚本结束时会删除整个 ${tempRoot}）`)

  let exitCode = 0
  try {
    console.log(`Cloning ${logUrl}${ref ? ` (ref: ${ref})` : ''} ...`)
    const cloneArgs = ['clone', '--depth', '1']
    if (ref)
      cloneArgs.push('--branch', ref)
    cloneArgs.push(cloneTargetUrl, repoDir)
    runGit(cloneArgs, root)

    const sourcePath = join(repoDir, SOURCE_DIR)
    if (!existsSync(sourcePath)) {
      console.error(`仓库中不存在目录: ${SOURCE_DIR}/`)
      exitCode = 1
    }
    else {
      const outputPath = join(root, 'skills', OUTPUT_SKILL)
      console.log(`Syncing ${SOURCE_DIR}/ → skills/${OUTPUT_SKILL}/ ...`)
      copySkillTree(sourcePath, outputPath)
      copyLicenseFromRepo(repoDir, outputPath)

      const sha = gitRevParse(repoDir)
      const date = new Date().toISOString().split('T')[0]
      const syncContent = `# Sync Info

- **Git SHA:** \`${sha ?? 'unknown'}\`
- **Synced:** ${date}
`

      writeFileSync(join(outputPath, 'SYNC.md'), syncContent)
      console.log(`Done. Git SHA: ${sha ?? 'unknown'}`)
    }
  }
  catch (e) {
    console.error(e instanceof Error ? e.message : e)
    exitCode = 1
  }
  finally {
    try {
      rmSync(tempRoot, { recursive: true, force: true })
      if (verbose)
        console.log(`已删除临时目录: ${tempRoot}`)
    }
    catch (rmErr) {
      console.error(
        `警告: 未能删除临时目录（可手动删掉）: ${tempRoot}`,
        rmErr instanceof Error ? rmErr.message : rmErr,
      )
    }
  }

  if (exitCode !== 0)
    process.exit(exitCode)
}

main()
