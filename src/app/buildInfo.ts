export const GIT_SHA =
  typeof __GIT_SHA__ !== 'undefined' && __GIT_SHA__ ? __GIT_SHA__ : 'dev';

export const BUILD_TIME =
  typeof __BUILD_TIME__ !== 'undefined' && __BUILD_TIME__
    ? __BUILD_TIME__
    : new Date().toISOString();

export const MODE = import.meta.env.MODE;
