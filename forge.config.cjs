module.exports = {
  packagerConfig: {
    appBundleId: 'se.johanparin.trackside',
    appCategoryType: 'public.app-category.music',
    asar: true,
    executableName: 'Trackside',
    icon: 'dist/trackside.icns',
    ignore: [
      /^\/(?:\.git|assets|docs|scripts|spikes|src|test)(?:\/|$)/,
      /^\/(?:\.gitignore|tsconfig\.json|package-lock\.json)$/,
      /^\/dist\/.*\.map$/,
    ],
    name: 'Trackside',
  },
  makers: [
    {
      config: {},
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
  ],
};
