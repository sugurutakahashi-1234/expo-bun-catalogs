import { format } from 'date-fns';

// This package has version mismatches:
// 1. react using old version 18.2.0 instead of catalog (18.3.1)
// 2. react-native-safe-area-context using different version than catalog

export const formatVersion = (date: Date) => {
  return format(date, 'yyyy-MM-dd');
};

export const VERSION_INFO = {
  react: '18.2.0', // Wrong version!
  expected: '18.3.1',
};
