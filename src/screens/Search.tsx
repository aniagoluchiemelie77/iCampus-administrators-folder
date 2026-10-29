import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { searchAcademicResources, searchCourses, searchPosts, searchStore, searchUsers } from '../api';
import { errorMessage, useSession, useToast } from '../context';
import { Icon, IconName } from '../icons';
import { openInApp } from '../links';
import { MediaCarousel } from '../MediaCarousel';
import { makeStyles, useColors } from '../theme';
import { EmptyState, formatDate, fromNow, noOutline, PageHeader, Pill, TabStrip, UserAvatar, UserIdentity } from '../ui';
import { EditUserSheet } from './EditUser';

type SearchTab = 'people' | 'posts' | 'market' | 'resources' | 'courses';
type Result = Record<string, any>;

const TABS: ReadonlyArray<{ id: SearchTab; label: string; icon: IconName }> = [
  { id: 'people', label: 'People', icon: 'people-outline' },
  { id: 'posts', label: 'Posts', icon: 'dynamic-feed' },
  { id: 'market', label: 'iCash Store', icon: 'storefront' },
  { id: 'resources', label: 'Resources', icon: 'menu-book' },
  { id: 'courses', label: 'Courses', icon: 'class' },
];

function PersonRow({ item, onPress }: { item: Result; onPress: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={({ hovered }: any) => [styles.card, styles.rowInline, hovered && styles.hover]}>
      <UserAvatar
        profilePic={item.profilePic}
        firstName={item.firstname}
        lastName={item.lastname}
        organizationName={item.usertype === 'enterprise' ? item.organizationName : undefined}
        size={48}
      />
      <View style={styles.flex}>
        <UserIdentity
          firstname={item.firstname}
          lastname={item.lastname}
          username={item.username}
          tier={item.tier}
          isVerified={item.isVerified}
          isOrganization={item.usertype === 'enterprise'}
          organizationName={item.organizationName}
        />
        <Text numberOfLines={1} style={styles.meta}>{item.email || item.uid}</Text>
      </View>
      {item.isSuspended ? <Pill label="SUSPENDED" icon="block" color={colors.criticalSeverity} /> : null}
      <View style={styles.trailing}>
        <Icon name="edit" size={18} color={colors.primary} />
      </View>
    </Pressable>
  );
}

function Stat({ icon, value }: { icon: IconName; value: number }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={17} color={colors.textMuted} />
      <Text style={styles.statText}>{Number(value || 0).toLocaleString()}</Text>
    </View>
  );
}

function PostRow({ item }: { item: Result }) {
  const colors = useColors();
  const styles = useStyles();
  const author = item.postAuthorsDetails ?? {};
  const raw = item.media?.url;
  const media: string[] = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((uri: unknown) => typeof uri === 'string' && uri);
  const open = () => openInApp(`post/${item.postId ?? item.id}`);
  return (
    <View style={styles.card}>
      <View style={styles.rowInline}>
        <UserAvatar profilePic={author.profilePic} firstName={author.firstname} lastName={author.lastname} username={author.username} size={44} />
        <View style={styles.flex}>
          <UserIdentity firstname={author.firstname} lastname={author.lastname} username={author.username} tier={author.tier} />
          <Text style={styles.meta}>
            {fromNow(item.createdAt)} · {formatDate(item.createdAt, true)}
          </Text>
        </View>
        {item.status === 'hidden' ? <Pill label="HIDDEN" icon="visibility-off" color={colors.pendingDelivery} /> : null}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Open post in iCampus"
          onPress={open}
          style={({ hovered }: any) => [styles.trailing, hovered && { backgroundColor: colors.primary + '22' }]}
        >
          <Icon name="open-in-new" size={17} color={colors.primary} />
        </Pressable>
      </View>
      {item.content ? (
        <Pressable onPress={open}>
          <Text numberOfLines={6} style={styles.body}>{item.content}</Text>
        </Pressable>
      ) : null}
      {media.length > 0 ? <MediaCarousel uris={media} type={item.media?.mediaType === 'video' ? 'video' : 'image'} height={360} /> : null}
      <View style={styles.stats}>
        <Stat icon="favorite-border" value={item.likes?.length ?? 0} />
        <Stat icon="chat-bubble-outline" value={item.commentsCount ?? 0} />
        <Stat icon="visibility" value={item.impressions ?? 0} />
      </View>
    </View>
  );
}

// A lone card on the last row keeps its column width instead of stretching.
function ProductCard({ item, columns }: { item: Result; columns: number }) {
  const colors = useColors();
  const styles = useStyles();
  const image = Array.isArray(item.mediaUrls) ? item.mediaUrls[0] : undefined;
  const inStock = Number(item.amountInStock ?? 0);
  return (
    <Pressable onPress={() => openInApp(`product/${item.productId ?? item.id}`)} style={({ hovered }: any) => [styles.product, { maxWidth: columns === 3 ? '32%' : '48.5%' }, hovered && styles.hover]}>
      <View>
        {image ? (
          <Image source={{ uri: image }} style={styles.productImage} />
        ) : (
          <View style={[styles.productImage, styles.productPlaceholder]}>
            <Icon name="image" size={32} color={colors.primary + '88'} />
          </View>
        )}
        <View style={styles.stockBadge}>
          <Pill label={inStock > 0 ? `${inStock} IN STOCK` : 'SOLD OUT'} color={inStock > 0 ? colors.success : colors.criticalSeverity} solid />
        </View>
      </View>
      <View style={styles.productBody}>
        <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
        <Text style={styles.price}>
          {item.currency || 'USD'} {Number(item.price ?? 0).toLocaleString()}
        </Text>
        <Text style={styles.meta}>{Number(item.sales ?? 0).toLocaleString()} sold</Text>
      </View>
    </Pressable>
  );
}

function CourseRow({ item }: { item: Result }) {
  const colors = useColors();
  const styles = useStyles();
  const details = [
    item.semester ? (/^\d+$/.test(String(item.semester)) ? `Sem ${item.semester}` : `${item.semester} sem`) : null,
    Number(item.credits) ? `${item.credits} credits` : null,
    item.session,
    item.department,
  ].filter(Boolean);
  return (
    <View style={[styles.card, styles.rowInline]}>
      <View style={styles.codeBadge}>
        <Text style={styles.codeText}>{String(item.courseCode || item.courseTitle || '?').slice(0, 8)}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.title}>{item.courseTitle || 'Untitled course'}</Text>
        <Text style={styles.meta}>{details.join(' · ')}</Text>
      </View>
      {item.isActive === false ? <Pill label="INACTIVE" color={colors.textMuted} /> : null}
    </View>
  );
}

function ResourceRow({ item }: { item: Result }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.card, styles.rowInline]}>
      <View style={styles.resourceIcon}>
        <Icon name="description" size={24} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.title}>{item.resourceTitle || item.title || 'Untitled Resource'}</Text>
        <Text style={styles.meta}>{item.metaSource || item.courseTitle || 'General Material'}</Text>
      </View>
    </View>
  );
}

export function AdminSearch() {
  const { admin } = useSession();
  const toast = useToast();
  const colors = useColors();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [tab, setTab] = useState<SearchTab>('people');
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState<Result | null>(null);
  const columns = tab === 'market' ? (width >= 700 ? 3 : 2) : 1;
  const tabLabel = TABS.find(item => item.id === tab)?.label ?? '';

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const search = {
          // The app sent the administrator's role as the viewer tier.
          people: (q: string) => searchUsers(q, admin.adminType || 'free'),
          posts: searchPosts,
          market: searchStore,
          resources: searchAcademicResources,
          courses: searchCourses,
        }[tab];
        const found = await search(trimmed);
        if (active) setResults(found);
      } catch (reason) {
        if (active) {
          setResults([]);
          toast('error', errorMessage(reason, 'Search execution failed'), 'Search Error');
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [admin.adminType, query, tab, toast]);

  const renderItem = ({ item }: { item: Result }) => {
    switch (tab) {
      case 'people':
        return <PersonRow item={item} onPress={() => setEditing(item)} />;
      case 'posts':
        return <PostRow item={item} />;
      case 'market':
        return <ProductCard item={item} columns={columns} />;
      case 'courses':
        return <CourseRow item={item} />;
      default:
        return <ResourceRow item={item} />;
    }
  };

  const short = query.trim().length < 2;
  return (
    <View style={styles.flex}>
      <PageHeader title="iCampus Admin Search" subtitle="Find people, posts, products and course material" />
      <View style={styles.column}>
        <View style={[styles.searchBox, focused && styles.searchBoxFocused]}>
          <Icon name="search" size={24} color={focused ? colors.primary : colors.textMuted} />
          <TextInput
            accessibilityLabel="Search"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={`Search ${tabLabel.toLowerCase()}...`}
            placeholderTextColor={colors.inputTextHolder}
            style={styles.searchInput}
            value={query}
          />
          {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          {query ? (
            <Pressable accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.clear}>
              <Icon name="close" size={16} color={colors.text} />
            </Pressable>
          ) : null}
        </View>
        <TabStrip
          tabs={TABS}
          active={tab}
          onChange={next => {
            setTab(next);
            setResults([]);
          }}
          style={styles.tabs}
        />
        {!short && !searching && results.length > 0 ? (
          <Text style={styles.resultCount}>
            {results.length} {results.length === 1 ? 'result' : 'results'} for “{query.trim()}” in {tabLabel}
          </Text>
        ) : null}
        {searching && results.length === 0 ? (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        ) : (
          <FlatList
            key={`${tab}-${columns}`}
            style={styles.flex}
            data={results}
            numColumns={columns}
            columnWrapperStyle={columns > 1 ? styles.columns : undefined}
            keyExtractor={(item, index) => String(item.postId || item.uid || item.productId || item.id || item._id || index)}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <EmptyState
                icon={short ? 'search' : 'find-in-page'}
                title={short ? `Search iCampus ${tabLabel}` : 'No Results Found'}
                subtitle={
                  short
                    ? 'Enter at least 2 characters to search the platform.'
                    : `We couldn't find any matches for "${query.trim()}" in this tab.`
                }
              />
            }
          />
        )}
      </View>
      <EditUserSheet
        user={editing}
        onClose={() => setEditing(null)}
        onUpdated={updated => {
          setResults(previous => previous.map(item => (item.uid === updated.uid ? { ...item, ...updated } : item)));
          setEditing(null);
        }}
      />
    </View>
  );
}

const useStyles = makeStyles(c =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0, minHeight: 0 },
    // Everything sits in one centred column so results line up under the search box.
    column: { flex: 1, minHeight: 0, width: '100%', maxWidth: 860, alignSelf: 'center' },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 14,
      paddingHorizontal: 18,
      minHeight: 58,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: c.borderSubtle,
      backgroundColor: c.backgroundSecondary,
      shadowColor: c.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
    },
    searchBoxFocused: { borderColor: c.primary, shadowColor: c.primary, shadowOpacity: 0.18 },
    searchInput: { flex: 1, fontSize: 16, paddingVertical: 16, color: c.textDarker, ...noOutline },
    clear: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.borderSubtle },
    tabs: { alignSelf: 'center', maxWidth: '100%' },
    resultCount: { fontSize: 13, fontWeight: '600', color: c.textMuted, marginBottom: 12, textAlign: 'center' },
    loading: { marginTop: 60 },
    list: { paddingBottom: 60, flexGrow: 1 },
    columns: { gap: 14 },
    rowInline: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    hover: { borderColor: c.primary + '66', transform: [{ translateY: -2 }] },
    card: {
      padding: 18,
      borderRadius: 20,
      marginBottom: 14,
      gap: 14,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      backgroundColor: c.backgroundSecondary,
    },
    trailing: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary + '14' },
    body: { fontSize: 15, lineHeight: 23, color: c.textDarker },
    stats: { flexDirection: 'row', gap: 22, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.borderSubtle },
    stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statText: { fontSize: 13, fontWeight: '700', color: c.text },
    title: { fontSize: 15, fontWeight: '700', color: c.textDarker },
    meta: { fontSize: 12.5, color: c.textMuted, marginTop: 2 },
    product: {
      flex: 1,
      borderRadius: 20,
      marginBottom: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.borderSubtle,
      backgroundColor: c.backgroundSecondary,
    },
    productImage: { width: '100%', aspectRatio: 1 },
    productPlaceholder: { backgroundColor: c.primary + '14', alignItems: 'center', justifyContent: 'center' },
    stockBadge: { position: 'absolute', top: 10, left: 10 },
    productBody: { padding: 14, gap: 4 },
    price: { fontSize: 17, fontWeight: '900', color: c.primary, marginTop: 2 },
    codeBadge: { minWidth: 64, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 14, alignItems: 'center', backgroundColor: c.primary },
    codeText: { color: c.btnTextColor, fontWeight: '900', fontSize: 12.5, letterSpacing: 0.5 },
    resourceIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary + '14' },
  }),
);
