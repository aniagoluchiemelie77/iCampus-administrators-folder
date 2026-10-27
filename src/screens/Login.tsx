import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { AdminSession, loginAdmin } from '../api';
import { errorMessage, useToast } from '../context';
import { Icon, IconName } from '../icons';
import { makeStyles, PRIMARY_COLOR_TINT, PRIMARY_COLOR_TINT_MAIN, useColors } from '../theme';
import { Button, Field, isValidEmail } from '../ui';

const PATTERN_ICONS: IconName[] = ['auto-stories', 'shopping-cart', 'account-balance', 'diamond'];

/** The iCampus IconBackground: a faint grid of brand icons behind the card. */
function IconBackground() {
  const { width, height } = useWindowDimensions();
  const colors = useColors();
  const count = Math.ceil((width / 40) * (height / 40));
  return (
    <View pointerEvents="none" style={[styles.pattern, { opacity: colors.loginPatternOpacity }]}>
      {Array.from({ length: count }, (_, index) => (
        <Icon
          key={index}
          name={PATTERN_ICONS[index % PATTERN_ICONS.length]}
          size={index % 7 === 0 ? 27 : 20}
          color={index % 5 === 0 ? PRIMARY_COLOR_TINT : PRIMARY_COLOR_TINT_MAIN}
          style={styles.patternIcon}
        />
      ))}
    </View>
  );
}

/**
 * Passwords to try, in order. Signup never trimmed passwords, so one could
 * genuinely start or end with a space: try the trimmed password first (the
 * common case: an accidental space), then the exact text if they differ.
 */
const passwordAttempts = (password: string) => {
  const trimmed = password.trim();
  if (!trimmed) return [];
  return trimmed === password ? [password] : [trimmed, password];
};

export function Login({ onLogin }: { onLogin: (session: AdminSession) => void }) {
  const colors = useColors();
  const themed = useThemedStyles();
  const toast = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const trimmedIdentifier = identifier.trim();
  const canSubmit = useMemo(
    () => isValidEmail(trimmedIdentifier) && password.trim().length > 0,
    [trimmedIdentifier, password],
  );

  const submit = async () => {
    const passwords = passwordAttempts(password);
    if (!trimmedIdentifier || passwords.length === 0) {
      toast('error', 'Ensure required fields are not empty.');
      return;
    }
    setIdentifier(trimmedIdentifier);
    setLoading(true);
    try {
      let session: AdminSession;
      try {
        session = await loginAdmin(trimmedIdentifier, passwords[0]);
      } catch (reason) {
        if (passwords.length < 2) throw reason;
        session = await loginAdmin(trimmedIdentifier, passwords[1]);
      }
      onLogin(session);
    } catch (reason) {
      toast('error', errorMessage(reason, 'Invalid credentials.'), 'Login Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={themed.page}>
      <IconBackground />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={themed.card}>
          <Icon name="lock-outline" size={60} color={colors.primary} />
          <Text style={themed.title}>Admin Login</Text>
          <Field
            icon="email"
            keyboardType="email-address"
            onChangeText={setIdentifier}
            placeholder="Enter your email..."
            style={styles.field}
            value={identifier}
          />
          {trimmedIdentifier.length > 0 && !isValidEmail(trimmedIdentifier) ? (
            <Text style={themed.validation}>Invalid email format</Text>
          ) : null}
          <Field
            onChangeText={setPassword}
            placeholder="Enter your password..."
            right={
              <Pressable
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                accessibilityRole="button"
                onPress={() => setShowPassword(value => !value)}
              >
                <Icon name={showPassword ? 'visibility-off' : 'visibility'} size={20} color={colors.primaryTint} />
              </Pressable>
            }
            onSubmitEditing={() => canSubmit && !loading && void submit()}
            secureTextEntry={!showPassword}
            style={styles.field}
            value={password}
          />
          <Button
            title={loading ? 'Logging in...' : 'Login'}
            onPress={() => void submit()}
            disabled={loading || !canSubmit}
            style={styles.submit}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pattern: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'flex-start',
    overflow: 'hidden',
  },
  patternIcon: { margin: 10 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  field: { width: '100%', marginBottom: 20 },
  submit: { width: '100%' },
});

const useThemedStyles = makeStyles(c =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: c.loginBackground },
    card: {
      alignItems: 'center',
      maxWidth: 400,
      width: '100%',
      padding: 25,
      backgroundColor: c.loginCard,
      borderRadius: 15,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    title: { fontSize: 25, color: c.primary, fontWeight: 'bold', marginVertical: 25 },
    validation: { fontSize: 12, color: c.primary, fontWeight: '800', marginTop: -12, marginBottom: 15, width: '100%' },
  }),
);
