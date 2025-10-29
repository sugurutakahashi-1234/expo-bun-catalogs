import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { Button, DateButton } from '@packages/ui';

export default function App() {
  const handlePress = () => {
    console.log('Button pressed from @packages/ui!');
  };

  const handleDatePress = () => {
    console.log('Date button pressed!');
  };

  return (
    <View style={styles.container}>
      <Button title="Hello from UI Package" onPress={handlePress} />

      <View style={styles.spacer} />

      <DateButton
        date={new Date()}
        dateFormat="PPP"
        baseColor="#667eea"
        onPress={handleDatePress}
      />

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    height: 20,
  },
});
