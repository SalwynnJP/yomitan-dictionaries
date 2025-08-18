const getProperty = (propertyName) => {
  const propertyValue = PropertiesService.getScriptProperties().getProperty(propertyName);
  if (!propertyValue) {
    throw new Error(`${propertyName} not set`);
  }
  return propertyValue;
};

const JAPANESE_FOLDER_ID = getProperty('japaneseFolderId');
const MANDARIN_FOLDER_ID = getProperty('mandarinFolderId');
const CANTONESE_FOLDER_ID = getProperty('cantoneseFolderId');
const JA_STARTER_PACK = getProperty('jaStarterPack');
const githubAccessToken = getProperty('githubAccessToken');

function downloadAllRepos() {
  for (const repo of REPOS_TO_UPDATE) {
    try {
      downloadFromGithub(repo);
    } catch (error) {
      Logger.log(`Error downloading repo ${repo.url}: ${error.message}`);
    }
  }
  updateStarterDictionariesPack();
}

/**
 * @typedef {Object} GithubRepoDictionary
 * @property {string} url
 * @property {string} folderId
 * @property {RegExp} includedNameRegex
 * @property {RegExp} removeNameRegex
 * @property {string} fileNamePrefix
 * @property {boolean} [addDate]
 */
/**
 * @type {GithubRepoDictionary[]}
 */
const REPOS_TO_UPDATE = [
  {
    url: 'https://api.github.com/repos/stephenmk/stephenmk.github.io/releases/latest',
    folderId: JAPANESE_FOLDER_ID,
    includedNameRegex: /yomi/,
    removeNameRegex: /jitendex/,
    fileNamePrefix: '[JA-EN] ',
    addDate: true,
  },
  {
    url: 'https://api.github.com/repos/yomidevs/jmdict-yomitan/releases/latest',
    folderId: JAPANESE_FOLDER_ID,
    includedNameRegex: /JMnedict/,
    removeNameRegex: /JMnedict/,
    fileNamePrefix: '[JA-JA Names] ',
    addDate: true,
  },
  {
    url: 'https://api.github.com/repos/yomidevs/jmdict-yomitan/releases/latest',
    folderId: JAPANESE_FOLDER_ID,
    includedNameRegex: /KANJIDIC_english/,
    removeNameRegex: /KANJIDIC_english/,
    fileNamePrefix: '[Kanji] ',
    addDate: true,
  },
  {
    url: 'https://api.github.com/repos/MarvNC/cc-cedict-yomitan/releases/latest',
    folderId: MANDARIN_FOLDER_ID,
    includedNameRegex: /CC\-CEDICT(?!\.Hanzi)/,
    removeNameRegex: /CC\-CEDICT(?!\.Hanzi)/,
    fileNamePrefix: '[ZH-EN] ',
    addDate: true,
  },
  {
    url: 'https://api.github.com/repos/MarvNC/cc-cedict-yomitan/releases/latest',
    folderId: MANDARIN_FOLDER_ID,
    includedNameRegex: /CC\-CEDICT\.Hanzi/,
    removeNameRegex: /CC\-CEDICT\.Hanzi/,
    fileNamePrefix: '[Hanzi] ',
    addDate: true,
  },
  {
    url: 'https://api.github.com/repos/MarvNC/wordshk-yomitan/releases/latest',
    folderId: CANTONESE_FOLDER_ID,
    includedNameRegex: /Words\.hk\.[\d-]+.zip$/,
    removeNameRegex: /Words\.hk\.[\d-]+.zip$/,
    fileNamePrefix: '[YUE-EN & YUE] ',
    addDate: false,
  },
  {
    url: 'https://api.github.com/repos/MarvNC/wordshk-yomitan/releases/latest',
    folderId: CANTONESE_FOLDER_ID,
    includedNameRegex: /Words\.hk\.Honzi.[\d-]+.zip$/,
    removeNameRegex: /Words\.hk\.Honzi.[\d-]+.zip$/,
    fileNamePrefix: '[Honzi] ',
    addDate: false,
  },
  {
    url: 'https://api.github.com/repos/MarvNC/pixiv-yomitan/releases/latest',
    folderId: JAPANESE_FOLDER_ID,
    includedNameRegex: /^PixivLight_[\d\-]+\.zip$/,
    removeNameRegex: /^PixivLight_[\d\-]+\.zip$/,
    fileNamePrefix: '[JA-JA Encyclopedia] ',
    addDate: false,
  },
];

/**
 * @type {RegExp[]}
 */
const STARTER_DICTIONARIES_ORDER = [
  /\[JA-EN\] jitendex-yomitan.*/,
  /\[JA-EN\] 新和英.*/,
  /\[JA-JA Names\] JMnedict.*/,
  /\[JA-EN Grammar\] dojg-consolidated-v1_01.*/,
  /\[JA Freq\] JPDB_v2.*_Frequency_Kana.*/,
  /\[JA Freq\] Freq_CC100.*/,
  /\[JA Freq\] BCCWJ.*/,
  /\[JA-JA\] 小学館例解学習国語 第十二版.*/,
  /\[JA-JA\] 大辞泉 第二版.*/,
  /\[JA-JA Encyclopedia\] PixivLight.*/,
  /\[JA-JA Thesaurus\] 使い方の分かる 類語例解辞典.*/,
  /\[JA-JA\] 漢検漢字辞典　第二版.*/,
  /\[Kanji\] KANJIDIC_english.*/,
  /\[Kanji\] JPDB Kanji.*/,
  /\[Pitch\] NHK2016.*/,
];

/**
 * @type {RegExp[]}
 */
const UPDATING_DICTIONARIES_TO_COPY_JA_TO_STARTER_PACK = [
  /\[JA-EN\] jitendex-yomitan.*/,
  /\[JA-JA Encyclopedia\] PixivLight.*/,
  /\[Kanji\] KANJIDIC_english.*/,
];

/**
 * Update Starter Dictionaries Pack
 * - This runs after the main downloadFromGithub script runs
 * - We first copy over all the dictionaries in `STARTER_DICTIONARIES_ORDER`
 * that aren't already in the starter pack folder and don't match the regex.
 * - Then we go over the updating dictionaries list and delete and re-add the latest version
 * - Then we go again through `STARTER_DICTIONARIES_ORDER` and prepend the files with
 * a two-digit index
 */
function updateStarterDictionariesPack() {
  const JapaneseFolder = DriveApp.getFolderById(JAPANESE_FOLDER_ID);
  const JapaneseStarterPack = DriveApp.getFolderById(JA_STARTER_PACK);

  // Get all files in both folders as arrays for easier manipulation
  const japaneseFiles = [];
  const japaneseFilesIterator = JapaneseFolder.getFiles();
  while (japaneseFilesIterator.hasNext()) {
    japaneseFiles.push(japaneseFilesIterator.next());
  }

  const starterPackFiles = [];
  const starterPackFilesIterator = JapaneseStarterPack.getFiles();
  while (starterPackFilesIterator.hasNext()) {
    starterPackFiles.push(starterPackFilesIterator.next());
  }

  // Step 1: Copy dictionaries from STARTER_DICTIONARIES_ORDER that aren't already in starter pack
  for (const dictionaryRegex of STARTER_DICTIONARIES_ORDER) {
    // Find matching file in Japanese folder
    const matchingJapaneseFile = japaneseFiles.find((file) =>
      file.getName().match(dictionaryRegex)
    );

    if (matchingJapaneseFile) {
      // Check if it's already in starter pack (ignoring numbered prefixes)
      const fileName = matchingJapaneseFile.getName();
      const isAlreadyInStarterPack = starterPackFiles.some((starterFile) => {
        const starterFileName = starterFile.getName();
        // Remove numbered prefix (e.g., "01 " or "02 ") to compare base names
        const baseStarterName = starterFileName.replace(/^\d{2}\s/, '');
        return baseStarterName === fileName;
      });

      if (!isAlreadyInStarterPack) {
        // Copy file to starter pack
        const copiedFile = matchingJapaneseFile.makeCopy(JapaneseStarterPack);
        starterPackFiles.push(copiedFile);
        Logger.log(`Copied ${fileName} to starter pack`);
      }
    }
  }

  // Step 2: Handle updating dictionaries - remove old versions and copy new ones
  for (const updatingDictionaryRegex of UPDATING_DICTIONARIES_TO_COPY_JA_TO_STARTER_PACK) {
    // Remove existing versions from starter pack
    removeFilesWithRegexBypassTrash(JA_STARTER_PACK, updatingDictionaryRegex);

    // Remove matching files from our array too
    const filesToRemove = starterPackFiles.filter((file) => {
      const baseFileName = file.getName().replace(/^\d{2}\s/, '');
      return baseFileName.match(updatingDictionaryRegex);
    });

    filesToRemove.forEach((fileToRemove) => {
      const index = starterPackFiles.indexOf(fileToRemove);
      if (index > -1) {
        starterPackFiles.splice(index, 1);
      }
    });

    // Find and copy the latest version from Japanese folder
    const latestFile = japaneseFiles.find((file) => file.getName().match(updatingDictionaryRegex));

    if (latestFile) {
      const copiedFile = latestFile.makeCopy(JapaneseStarterPack);
      starterPackFiles.push(copiedFile);
      Logger.log(`Added latest version: ${latestFile.getName()}`);
    }
  }

  // Step 3: Rename all files with two-digit prefixes based on STARTER_DICTIONARIES_ORDER
  for (let i = 0; i < STARTER_DICTIONARIES_ORDER.length; i++) {
    const dictionaryRegex = STARTER_DICTIONARIES_ORDER[i];
    const prefix = String(i + 1).padStart(2, '0');

    // Find matching file in starter pack
    const matchingFile = starterPackFiles.find((file) => {
      const baseFileName = file.getName().replace(/^\d{2}\s/, '');
      return baseFileName.match(dictionaryRegex);
    });

    if (matchingFile) {
      const currentName = matchingFile.getName();
      const baseFileName = currentName.replace(/^\d{2}\s/, '');
      const newName = `${prefix} ${baseFileName}`;

      if (currentName !== newName) {
        matchingFile.setName(newName);
        Logger.log(`Renamed ${currentName} to ${newName}`);
      }
    }
  }

  Logger.log('Starter dictionaries pack update completed');
}

// Function to download a release repo dictionary from GitHub and save it to Google Drive
/**
 * @param {GithubRepoDictionary} githubRepo
 */
function downloadFromGithub(githubRepo) {
  const headers = {
    Authorization: 'token ' + githubAccessToken,
  };

  const options = {
    headers: headers,
  };

  /** @type {GithubRelease} */
  let releaseData;
  try {
    const releaseInfo = UrlFetchApp.fetch(githubRepo.url, options).getContentText();
    releaseData = JSON.parse(releaseInfo);
  } catch (error) {
    Logger.log(`Error fetching release data for ${githubRepo.url}: ${error.message}`);
    return;
  }

  const assets = releaseData.assets;

  // Find the asset containing the includedNameRegex in its name and download it
  const asset = assets.find(
    (/**@type {GithubAsset} */ asset) =>
      asset.name.match(githubRepo.includedNameRegex) && asset.name.endsWith('.zip')
  );

  // If asset is found, download it and save it to Google Drive
  if (asset?.browser_download_url && asset.browser_download_url !== '') {
    const response = UrlFetchApp.fetch(asset.browser_download_url);
    const fileBlob = response.getBlob();

    // Remove existing files for this dictionary
    removeFilesWithRegexBypassTrash(githubRepo.folderId, githubRepo.removeNameRegex);

    const folder = DriveApp.getFolderById(githubRepo.folderId);
    const createdFile = folder.createFile(fileBlob);
    // Prepend file with to follow naming convention
    let fileName = createdFile.getName();
    // add prefix
    fileName = githubRepo.fileNamePrefix + fileName;

    // Add date to file name if specified
    if (githubRepo.addDate) {
      const date = asset.created_at.split('T')[0];
      // Suffix before file extension
      fileName = fileName.replace(/(\.[\w\d_-]+)$/i, ` (${date})$1`);
    }

    createdFile.setName(fileName);

    Logger.log(`Downloaded ${createdFile.getName()} to Google Drive.`);
  } else {
    Logger.log(`No asset containing ${githubRepo.includedNameRegex} found in the latest release.`);
  }
}

/**
 * Remove existing files from a folder that match a regex
 * Uses the Google Drive API to delete files, so files will bypass the trash folder
 * @param {string} folderId
 * @param {RegExp} regexToRemove
 */
function removeFilesWithRegexBypassTrash(folderId, regexToRemove) {
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().match(regexToRemove)) {
      // Get the access token
      const accessToken = ScriptApp.getOAuthToken();

      // Define the URL
      const url = `https://www.googleapis.com/drive/v3/files/${file.getId()}`;

      // Make the request
      const response = UrlFetchApp.fetch(url, {
        method: 'delete',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        muteHttpExceptions: true,
      });

      // Log the response for debugging
      Logger.log(
        `Deleted ${file.getName()} from Google Drive. Response code: ${response.getResponseCode()}`
      );
    }
  }
}

/**
 * @typedef {Object} GithubRelease
 * @property {string} url
 * @property {string} assets_url
 * @property {string} upload_url
 * @property {string} html_url
 * @property {number} id
 * @property {Object} author
 * @property {string} author.login
 * @property {number} author.id
 * @property {string} author.node_id
 * @property {string} author.avatar_url
 * @property {string} author.gravatar_id
 * @property {string} author.url
 * @property {string} author.html_url
 * @property {string} author.followers_url
 * @property {string} author.following_url
 * @property {string} author.gists_url
 * @property {string} author.starred_url
 * @property {string} author.subscriptions_url
 * @property {string} author.organizations_url
 * @property {string} author.repos_url
 * @property {string} author.events_url
 * @property {string} author.received_events_url
 * @property {string} author.type
 * @property {boolean} author.site_admin
 * @property {string} node_id
 * @property {string} tag_name
 * @property {string} target_commitish
 * @property {string} name
 * @property {boolean} draft
 * @property {boolean} prerelease
 * @property {string} created_at
 * @property {string} published_at
 * @property {Array<GithubAsset>} assets
 * @property {string} tarball_url
 * @property {string} zipball_url
 * @property {string} body
 */

/**
 * @typedef {Object} GithubAsset
 * @property {string} url
 * @property {number} id
 * @property {string} node_id
 * @property {string} name
 * @property {string|null} label
 * @property {Object} uploader
 * @property {string} uploader.login
 * @property {number} uploader.id
 * @property {string} uploader.node_id
 * @property {string} uploader.avatar_url
 * @property {string} uploader.gravatar_id
 * @property {string} uploader.url
 * @property {string} uploader.html_url
 * @property {string} uploader.followers_url
 * @property {string} uploader.following_url
 * @property {string} uploader.gists_url
 * @property {string} uploader.starred_url
 * @property {string} uploader.subscriptions_url
 * @property {string} uploader.organizations_url
 * @property {string} uploader.repos_url
 * @property {string} uploader.events_url
 * @property {string} uploader.received_events_url
 * @property {string} uploader.type
 * @property {boolean} uploader.site_admin
 * @property {string} content_type
 * @property {string} state
 * @property {number} size
 * @property {number} download_count
 * @property {string} created_at
 * @property {string} updated_at
 * @property {string} browser_download_url
 */
