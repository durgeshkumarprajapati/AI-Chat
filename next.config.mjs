/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['amqplib', 'pg', 'redis', 'pdfjs-dist']
  }
};

export default nextConfig;
