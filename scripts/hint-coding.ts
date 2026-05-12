/**
 * After `pnpm install`: Coding Practices install steps (aligned with README).
 */
import process from 'node:process'

const CURL_URL = 'https://github.com/qiaozhu/skills.git/master/CODING_PRACTICES.md'

if (process.env.CI === 'true' || process.env.SKIP_CODING_PRACTICES_HINT === '1')
  process.exit(0)

console.log('')
console.log('\x1B[36m[skills]\x1B[0m 强烈建议：将 Coding Practices 规范纳入业务仓库的 AGENTS.md / CLAUDE.md。')
console.log('')
console.log('1. Download:')
console.log(`curl -o CODING_PRACTICES.md ${CURL_URL}`)
console.log('')
console.log('2. Append to AGENTS.md or CLAUDE.md:')
console.log('echo "@CODING_PRACTICES.md" | cat - AGENTS.md > temp && mv temp AGENTS.md')
console.log('echo "@CODING_PRACTICES.md" | cat - CLAUDE.md > temp && mv temp CLAUDE.md')
console.log('')
console.log('若同时使用 AGENTS.md 与 CLAUDE.md：为保持 AI 指令一致、避免重复维护，建议您无需单独维护 CLAUDE.md，在 CLAUDE.md 顶部写入 @AGENTS.md 即可。')
console.log('')
