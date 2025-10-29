import Constants from 'expo-constants';
import { debounce } from 'lodash';

// This package has multiple violations:
// 1. react-native with direct version instead of catalog
// 2. expo-constants not in catalog at all
// 3. @types/react in devDependencies instead of dependencies

export const getMixedData = () => {
  return {
    appName: Constants.expoConfig?.name,
    version: Constants.expoConfig?.version,
  };
};

export const debouncedMixed = debounce((value: string) => {
  console.log('Mixed:', value);
}, 500);
