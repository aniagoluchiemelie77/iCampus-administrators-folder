import { Linking } from 'react-native';

// Screens such as post details, profiles and transactions live in the main
// iCampus app, so the portal opens them through its deep links (App.tsx
// `linking` config in the iCampus repo).
const appUrl = () =>
  (process.env.EXPO_PUBLIC_APP_URL?.trim() || 'https://useicampus.io').replace(/\/+$/, '');

export const openInApp = (path: string) => {
  void Linking.openURL(`${appUrl()}/${path.replace(/^\/+/, '')}`);
};

/** The app route a notification points at, mirroring the iCampus notification handler. */
export const notificationPath = (item: Record<string, any>) => {
  const payload = item.payload ?? {};
  switch (item.actionType) {
    case 'POST_UPDATED':
    case 'NEW_POST':
    case 'POST_MENTION':
    case 'POST_LIKED':
    case 'POST_COMMENTED':
    case 'POLL_MILESTONE':
    case 'POST_REPOSTED':
      return payload.postId ? `post/${payload.postId}` : null;
    case 'PRODUCT_DELETION':
    case 'PRODUCT_CREATION':
    case 'PRODUCT_UPDATE':
      return 'product/seller-hub';
    case 'PROFILE_VIEW':
    case 'PROFILE_UPDATED':
      return item.recipientId ? `user/${item.recipientId}` : null;
    case 'NEW_FOLLOWER':
      return payload.followerId ? `user/${payload.followerId}` : null;
    case 'SALES_PAYOUT_SUCCESS':
    case 'MARKET_PURCHASE_DEBIT':
    case 'ICASH_PURCHASE':
    case 'ICASH_WITHDRAWAL':
      return payload.transactionId ? `transaction/${payload.transactionId}` : null;
    default:
      return item.notificationId ? `notification/${item.notificationId}` : null;
  }
};
