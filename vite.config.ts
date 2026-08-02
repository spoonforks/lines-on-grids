import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const repositoryOwner = process.env.GITHUB_REPOSITORY_OWNER
const isUserSite = repositoryName === `${repositoryOwner}.github.io`

export default defineConfig({
  base: process.env.GITHUB_ACTIONS && repositoryName && !isUserSite ? `/${repositoryName}/` : '/',
  plugins: [react()],
})
