import * as elasticlunr from 'elasticlunr';
import { IDBPDatabase } from 'idb';
import { curry, difference, filter, isNil, keys, map, tap } from 'ramda';
import { Status, User } from 'twitter-d';
import { StoreName, thTwitterDB } from '../types/dbTypes';
import { IndexTweet, thTweet, TweetId } from '../types/tweetTypes';
import { dbDelMany, dbGetMany, dbPutMany } from './idb_wrapper';
import { makeIndex } from './nlp';
import { updateIndexAndStoreToDb } from './stgOps';

import { stopWordFilter } from './stop_word_filter';
import { lunrZh } from './lunr.zh'

stopWordFilter(elasticlunr.default);
require('./lunr.stemmer.support')(elasticlunr.default);
lunrZh(elasticlunr);

export const loadIndexFromIdb = async (
  db_promise: Promise<IDBPDatabase<thTwitterDB>>
) => {
  const db = await db_promise;
  const indexJson = await db.get(StoreName.misc, 'index');
  const index = isNil(indexJson)
    ? makeIndex()
    : (elasticlunr.Index.load(indexJson) as elasticlunr.Index<IndexTweet>);
  index.use(elasticlunr.zh)
  return index;
};

/* Tweets */
// export const importTweets = curry(
//   async (
//     db: IDBPDatabase<thTwitterDB>,
//     prepFn: (x: any) => thTweet,
//     tweets: thTweet[]
//   ) => {
//     const thTweets: thTweet[] = map(prepFn, tweets);
//     return await dbPutMany(db, StoreName.tweets, thTweets);
//   }
// );

// export const removeTweets = curry(
//   async (db: IDBPDatabase<thTwitterDB>, ids: TweetId[]) => {
//     return await dbDelMany(db, StoreName.tweets, ids);
//   }
// );

export const findNewIdsInIdb = async (
  index: elasticlunr.Index<IndexTweet>,
  db
) => {
  const idxKeys = keys(index.documentStore.docInfo);
  const idbKeys = await db.getAllKeys('tweets');
  return difference(idbKeys, idxKeys);
};
export const findStaleIdsInIdx = async (
  index: elasticlunr.Index<IndexTweet>,
  db
) => {
  const idxKeys = keys(index.documentStore.docInfo);
  const idbKeys = await db.getAllKeys('tweets');
  return difference(idxKeys, idbKeys);
};

export const updateIdxFromIdb = async (
  index: elasticlunr.Index<IndexTweet>,
  db_promise: Promise<IDBPDatabase<thTwitterDB>>
) => {
  const db = await db_promise;
  const newIds = await findNewIdsInIdb(index, db);
  const staleIds = await findStaleIdsInIdx(index, db);
  const thTweets = await dbGetMany(db, StoreName.tweets, newIds).then(
    filter((x) => !isNil(x))
  );
  return updateIndexAndStoreToDb(db, index, thTweets, staleIds);
};

export const cbTimeFn = async (fn, callback) => {
  const timeStart = performance.now();
  return await fn().then(
    tap((_) => {
      callback(performance.now() - timeStart);
    })
  );
};
