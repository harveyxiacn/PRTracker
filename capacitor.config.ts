import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.harveyxiacn.prtracker',
  appName: 'PR Tracker',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_maple',
      iconColor: '#C8102E',
    },
  },
};

export default config;
