import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { searchAcademicResources, searchCourses, searchPosts, searchStore, searchUsers } from '../api';
import { errorMessage, useSession, useToast } from '../context';
import { Icon } from '../icons';
import { openInApp } from '../links';
import { makeStyles, useColors } from '../theme';
import { EmptyState, formatDate, noOutline, PageHeader, TabStrip, UserAvatar, UserIdentity } from '../ui';
import { EditUserSheet } from './EditUser';

type SearchTab = 'people' | 'posts' | 'market' | 'resources' | 'courses';
type Result = Record<string, any>;

const TABS: ReadonlyArray<{ id: SearchTab; label: string }> = [
  { id: 'people', label: 'People' },
  { id: 'posts', label: 'Posts' },
  { id: 'market', label: 'iCash Store' },
  { id: 'resources', label: 'Resources' },
  { id: 'courses', label: 'Courses' },
];

function PersonRow({ item, onPress }: { item: Result; onPress: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={({ hovered }: any) => [styles.row, hovered && styles.hover]}>
      <UserAvatar
        profilePic={item.profilePic}
        firstName={item.firstname}
        lastName={item.lastname}
        organizationName={item.usertype === 'enterprise' ? item.organizationName : undefined}
        size={40}
      />
      <View style={styles.flex}>
        <UserIdentity
          firstname={item.firstname}
          lastname={item.lastname}
          username={item.username}
          tier={item.tier}
          isVerified={item.isVerified}
          size="small"
          isOrganization={item.usertype === 'enterprise'}
          organizationName={item.organizationName}
        />
        <Text style={styles.meta}>{item.email || item.uid}</Text>
      </View>
      {item.isSuspended ? <Text style={styles.suspended}>SUSPENDED</Text> : null}
      <Icon name="edit" size={20} color={colors.primary} />
    </Pressable>
  );
}

function PostRow({ item }: { item: Result }) {
  const colors = useColors();
  const styles = useStyles();
  const author = item.postAuthorsDetails ?? {};
  const media = item.media?.url;
  const image = Array.isArray(media) ? media[0] : media;
  return (
    <Pressable onPress={() => openInApp(`post/${item.postId ?? item.id}`)} style={({ hovered }: any) => [styles.card, hovered && styles.hover]}>
      <View style={styles.rowInline}>
        <UserAvatar profilePic={author.profilePic} firstName={author.firstname} lastName={author.lastname} username={author.username} size={36} />
        <View style={styles.flex}>
          <UserIdentity firstname={author.firstname} lastname={author.lastname} username={author.username} tier={author.tier} size="small" />
          <Text style={styles.meta}>{formatDate(item.createdAt, true)}</Text>
        </View>
        <Icon name="open-in-new" size={16} color={colors.primaryTint} />
      </View>
      {item.content ? <Text numberOfLines={4} style={styles.body}>{item.content}</Text> : null}
      {image && item.media?.mediaType !== 'video' ? <Image source={{ uri: image }} style={styles.postImage} /> : null}
      <Text style={styles.meta}>
        {(item.likes?.length ?? 0)} likes · {item.commentsCount ?? 0} comments · {item.impressions ?? 0} views
        {item.status === 'hidden' ? ' · hidden' : ''}
      </Text>
    </Pressable>
  );
}

function ProductCard({ item }: { item: Result }) {
  const styles = useStyles();
  const image = Array.isArray(item.mediaUrls) ? item.mediaUrls[0] : undefined;
  return (
    <Pressable onPress={() => openInApp(`product/${item.productId ?? item.id}`)} style={({ hovered }: any) => [styles.product, hovered && styles.hover]}>
      {image ? <Image source={{ uri: image }} style={styles.productImage} /> : <View style={[styles.productImage, styles.productPlaceholder]} />}
      <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
      <Text style={styles.price}>
        {item.currency || 'USD'} {Number(item.price ?? 0).toLocaleString()}
      </Text>
      <Text style={styles.meta}>{item.amountInStock ?? 0} in stock · {item.sales ?? 0} sold</Text>
    </Pressable>
  );
}

function CourseRow({ item }: { item: Result }) {
  const styles = useStyles();
  const details = [
    item.semester ? (/^\d+$/.test(String(item.semester)) ? `Sem ${item.semester}` : `${item.semester} sem`) : null,
    Number(item.credits) ? `${item.credits} credits` : null,
    item.session,
    item.department,
  ].filter(Boolean);
  return (
    <View style={styles.card}>
      <View style={styles.rowInline}>
        <View style={styles.codeBadge}>
          <Text style={styles.codeText}>{String(item.courseCode || item.courseTitle || '?').slice(0, 8)}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>{item.courseTitle || 'Untitled course'}</Text>
          <Text style={styles.meta}>{details.join(' · ')}</Text>
        </View>
        {item.isActive === false ? <Text style={styles.suspended}>INACTIVE</Text> : null}
      </View>
    </View>
  );
}

function ResourceRow({ item }: { item: Result }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.card, styles.rowInline]}>
      <Icon name="description" size={26} color={colors.primary} />
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
  const [tab, setTab] = useState<SearchTab>('people');
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState<Result | null>(null);
  const productColumns = width >= 1100 ? 4 : width >= 700 ? 3 : 2;
  const columns = tab === 'market' ? productColumns : 1;

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
        return <ProductCard item={item} />;
      case 'courses':
        return <CourseRow item={item} />;
      default:
        return <ResourceRow item={item} />;
    }
  };

  const short = query.trim().length < 2;
  return (
    <View style={styles.flex}>
      <PageHeader title="iCampus Admin Search" />
      <View style={styles.searchBox}>
        <Icon name="search" size={22} color={colors.primaryTint} />
        <TextInput
          accessibilityLabel="Search"
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder={`Search ${TABS.find(item => item.id === tab)?.label.toLowerCase()}...`}
          placeholderTextColor={colors.inputTextHolder}
          style={styles.searchInput}
          value={query}
        />
        {query ? (
          <Pressable accessibilityLabel="Clear search" onPress={() => setQuery('')}>
            <Icon name="close" size={20} color={colors.primaryTint} />
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
      />
      {searching ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <FlatList
          key={`${tab}-${columns}`}
          data={results}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? styles.columns : undefined}
          keyExtractor={(item, index) => String(item.postId || item.uid || item.productId || item.id || item._id || index)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon={short ? 'search' : 'find-in-page'}
              title={short ? `Search iCampus ${TABS.find(item => item.id === tab)?.label}` : 'No Results Found'}
              subtitle={
                short
                  ? 'Enter at least 2 characters to search the platform.'
                  : `We couldn't find any matches for "${query.trim()}" in this tab.`
              }
            />
          }
        />
      )}
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
    flex: { flex: 1, minWidth: 0 },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 15,
      paddingHorizontal: 15,
      borderRadius: 12,
      borderWidth: 0.8,
      borderColor: c.border,
      backgroundColor: c.backgroundSecondary,
    },
    searchInput: { flex: 1, fontSize: 14, paddingVertical: 14, color: c.textDarker, ...noOutline },
    loading: { marginTop: 60 },
    list: { paddingBottom: 60, width: '100%', maxWidth: 1100, alignSelf: 'center' },
    columns: { gap: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 15, marginBottom: 12, backgroundColor: c.backgroundSecondary },
    rowInline: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    hover: { opacity: 0.85 },
    card: { padding: 15, borderRadius: 15, marginBottom: 12, gap: 10, backgroundColor: c.backgroundSecondary },
    body: { fontSize: 14, lineHeight: 20, color: c.text },
    postImage: { width: '100%', maxWidth: 420, height: 220, borderRadius: 12 },
    title: { fontSize: 15, fontWeight: '600', color: c.textDarker },
    meta: { fontSize: 12, color: c.text, opacity: 0.8 },
    suspended: { fontSize: 11, fontWeight: '800', color: c.primary },
    product: { flex: 1, maxWidth: 300, padding: 10, borderRadius: 15, marginBottom: 12, gap: 6, backgroundColor: c.backgroundSecondary },
    productImage: { width: '100%', aspectRatio: 1, borderRadius: 10 },
    productPlaceholder: { backgroundColor: c.primary + '22' },
    price: { fontSize: 15, fontWeight: '800', color: c.primary },
    codeBadge: { minWidth: 56, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, alignItems: 'center', backgroundColor: c.primary },
    codeText: { color: c.btnTextColor, fontWeight: '800', fontSize: 12 },
  }),
);
