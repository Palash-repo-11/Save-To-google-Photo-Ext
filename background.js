let cachedToken = null;

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: "SavetoGooglePhotos",
    title: "Save to Google Photos",
    contexts: ["image"]
  });
  if (details.reason === "install") {
    notify("Save to Google Photos","Use this extension to easily save any image from the web to your Google Photos with a single right click.");
}
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "SavetoGooglePhotos") {
    try {
      const token = await getToken(false);
      await uploadImageFlow(info.srcUrl, token);
    } catch (err) {
      console.error("Upload error:", err);
      await getToken(true)
      notify("Authentication Done",'please try again');
      
    }
  }
});

async function getToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error("Authentication failed"));
      } else {
        resolve(token);
      }
    });
  });
}

async function uploadImageFlow(imageUrl, token) {
  try {
    const blob = await fetch(imageUrl).then(res => res.blob());
    const uploadToken = await uploadToPhotos(blob, "image.jpg", token);
    const result = await createMediaItem(uploadToken, token);
    notify("Success", "Image uploaded to Google Photos.");
  } catch (err) {
    if (err.message.includes("401")) {
      cachedToken = null;
      chrome.identity.removeCachedAuthToken({ token }, async () => {
        try {
          const newToken = await getToken(true);
          const blob = await fetch(imageUrl).then(res => res.blob());
          const uploadToken = await uploadToPhotos(blob, "image.jpg", newToken);
          const result = await createMediaItem(uploadToken, newToken);
          notify("Success", "Image uploaded to Google Photos.");
        } catch (authErr) {
          notify("Upload Failed", authErr.message);
        }
      });
    } else {
      throw err;
    }
  }
}

async function uploadToPhotos(blob, filename, token) {
  const response = await fetch("https://photoslibrary.googleapis.com/v1/uploads", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "X-Goog-Upload-File-Name": filename,
      "X-Goog-Upload-Protocol": "raw"
    },
    body: blob
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  return await response.text();
}

async function createMediaItem(uploadToken, token) {
  const response = await fetch("https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      newMediaItems: [{
        description: "Uploaded via Chrome Extension",
        simpleMediaItem: { uploadToken }
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`Media creation failed: ${response.status}`);
  }

  return await response.json();
}

function notify(title, message) {
  chrome.notifications?.create({
    type: "basic",
    iconUrl: "Icon.png",
    title,
    message
  });
}
