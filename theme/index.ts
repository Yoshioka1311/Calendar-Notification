export interface AppTheme {
  dark: boolean;
  colors: {
    background: string;
    surface: string;
    surfaceElevated: string;
    text: string;
    textMuted: string;
    primary: string;
    primarySoft: string;
    border: string;
    danger: string;
    success: string;
    warning: string;
    overlay: string;
    tabBar: string;
  };
}

export const lightTheme: AppTheme = {
  dark: false,
  colors: {
    background: '#F6F7FB',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    text: '#172033',
    textMuted: '#697386',
    primary: '#5B5BD6',
    primarySoft: '#ECECFF',
    border: '#E7E9F0',
    danger: '#D83A52',
    success: '#16866B',
    warning: '#B56B00',
    overlay: 'rgba(23, 32, 51, 0.44)',
    tabBar: '#FFFFFF',
  },
};

export const darkTheme: AppTheme = {
  dark: true,
  colors: {
    background: '#0F1220',
    surface: '#191D2D',
    surfaceElevated: '#22273A',
    text: '#F4F5FA',
    textMuted: '#A9B0C2',
    primary: '#A7A5FF',
    primarySoft: '#2E3158',
    border: '#30364C',
    danger: '#FF758A',
    success: '#57D1B1',
    warning: '#F9B957',
    overlay: 'rgba(0, 0, 0, 0.62)',
    tabBar: '#171B2A',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;
