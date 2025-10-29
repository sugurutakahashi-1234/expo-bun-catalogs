import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  type TouchableOpacityProps,
} from 'react-native';
import { format } from 'date-fns';
import Color from 'color';

export interface DateButtonProps extends TouchableOpacityProps {
  date?: Date;
  dateFormat?: string;
  baseColor?: string;
}

export function DateButton({
  date = new Date(),
  dateFormat = 'PPP',
  baseColor = '#007AFF',
  style,
  ...props
}: DateButtonProps) {
  // date-fns で日付フォーマット
  const formattedDate = format(date, dateFormat);

  // color で背景色を操作
  const backgroundColor = baseColor;
  const darkerColor = Color(baseColor).darken(0.2).hex();
  const lighterColor = Color(baseColor).lighten(0.4).hex();

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor, shadowColor: darkerColor },
        style,
      ]}
      {...props}
    >
      <Text style={styles.label}>Selected Date</Text>
      <Text style={[styles.date, { color: lighterColor }]}>{formattedDate}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  date: {
    fontSize: 18,
    fontWeight: '700',
  },
});
