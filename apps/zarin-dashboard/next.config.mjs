/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  transpilePackages: [
    "@hackathon/contracts",
    "@hackathon/api-client",
    "@hackathon/chat-ui",
  ],
};

export default config;
