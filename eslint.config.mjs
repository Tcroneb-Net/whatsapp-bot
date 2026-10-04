import nextConfig from "eslint-config-next"

const config = [
  ...nextConfig,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "engine/**",
      "public/**",
    ],
  },
]

export default config
