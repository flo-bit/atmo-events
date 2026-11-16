export const FOR_YOU_AUDIENCE = 'did:web:foryou.club';
export const FOR_YOU_METHOD = 'club.foryou.feed.getFeedSkeleton';
// The OAuth grant allows this exact method for any service audience. Actual
// service JWTs remain bound to the concrete For You audience above.
export const FOR_YOU_SCOPE = `rpc:${FOR_YOU_METHOD}?aud=*`;
