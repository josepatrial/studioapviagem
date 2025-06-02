import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  sassOptions: {
 includePaths: ['./src'],
  },
};

export default nextConfig;
