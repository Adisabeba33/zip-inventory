/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are TypeScript sources consumed directly.
  transpilePackages: ['@inventory-index/core', '@inventory-index/db'],
  poweredByHeader: false,
  // The database driver must never be bundled into the client graph.
  serverExternalPackages: ['pg'],
  // The workspace packages are TypeScript sources that use NodeNext-style
  // ".js" specifiers, which is what Node and tsx want. Teach the bundler to
  // resolve those specifiers back to the .ts files they refer to.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
