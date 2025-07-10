// app.js - Logic for index.html

import {
  auth, db, appId, doc, getDoc, setDoc, collection, addDoc, query, onSnapshot,
  serverTimestamp, onAuthStateChanged, authenticateUser
} from './firebase-config.js';

// --- STATE ---
let currentUser = null;

// --- DOM ELEMENTS ---
const postsContainer = document.getElementById('posts-container');
const askInput = document.getElementById('ask-input');
const askBtn = document.getElementById('ask-btn');
const floatingBtn = document.querySelector('.floating-btn');

// --- UI RENDERING FUNCTIONS ---

/**
 * Renders the user's profile information in the sidebar and header.
 * @param {object} userData - The user data from Firestore.
 */
const renderUserProfile = (userData) => {
  const userInitial = userData.username.charAt(0).toUpperCase();
  document.getElementById('sidebar-profile-img').textContent = userInitial;
  document.getElementById('sidebar-profile-name').textContent = userData.username;
  document.getElementById('sidebar-profile-handle').textContent = userData.userIdHandle;
  document.getElementById('sidebar-followers-count').textContent = userData.followersCount || 0;
  document.getElementById('sidebar-following-count').textContent = userData.followingCount || 0;
  document.getElementById('user-avatar-link').textContent = userInitial;
};

/**
 * Renders a list of question posts in the main feed.
 * @param {Array<object>} posts - An array of question objects from Firestore.
 */
const renderPosts = (posts) => {
  if (posts.length === 0) {
    postsContainer.innerHTML = '<div class="card"><p>No questions have been asked yet. Be the first!</p></div>';
    return;
  }

  postsContainer.innerHTML = posts.map(post => {
    const postDate = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleString() : 'Just now';
    return `
      <div class="post-card card">
          <div class="post-header">
              <div class="anonymous-icon">${post.authorInitial || '?'}</div>
              <p class="post-meta">Asked by ${post.authorHandle || 'anonymous'} • ${postDate}</p>
          </div>
          <h2 class="post-title">${post.title}</h2>
          <div class="post-footer">
              <button class="post-action-btn"><i class="fas fa-arrow-up"></i> ${post.upvotes || 0}</button>
              <button class="post-action-btn"><i class="fas fa-arrow-down"></i> ${post.downvotes || 0}</button>
              <button class="post-action-btn"><i class="fas fa-comment"></i> ${post.commentCount || 0} Comments</button>
          </div>
      </div>
    `;
  }).join('');
};


// --- FIRESTORE SERVICE FUNCTIONS ---

/**
 * Fetches a user's profile from Firestore, creating it if it doesn't exist.
 * @param {string} uid - The user's unique ID from Firebase Auth.
 * @returns {Promise<object>} The user's data.
 */
const getUserProfile = async (uid) => {
  const userRef = doc(db, `artifacts/${appId}/users`, uid);
  let userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    // Create a new profile for the first-time anonymous user
    const shortId = uid.substring(0, 6);
    const newUser = {
      username: `Anonymous User #${shortId}`,
      userIdHandle: `@anon_${shortId}`,
      createdAt: serverTimestamp(),
      followersCount: 0,
      followingCount: 0,
    };
    await setDoc(userRef, newUser);
    userSnap = await getDoc(userRef); // Re-fetch the document to get server-generated timestamp
  }
  return { id: userSnap.id, ...userSnap.data() };
};

/**
 * Submits a new question to Firestore.
 * @param {string} title - The title of the question.
 */
const submitQuestion = async (title) => {
  if (!title.trim() || !currentUser) {
    console.error("Cannot submit empty question or user not logged in.");
    return;
  }

  try {
    await addDoc(collection(db, `artifacts/${appId}/public/data/questions`), {
      title: title,
      authorId: currentUser.id,
      authorHandle: currentUser.userIdHandle,
      authorInitial: currentUser.username.charAt(0).toUpperCase(),
      createdAt: serverTimestamp(),
      upvotes: 0,
      downvotes: 0,
      commentCount: 0,
    });
    askInput.value = ''; // Clear input on success
  } catch (error) {
    console.error("Error adding document: ", error);
  }
};

/**
 * Sets up a real-time listener for all questions.
 */
const listenForQuestions = () => {
    const q = query(collection(db, `artifacts/${appId}/public/data/questions`));
    onSnapshot(q, (querySnapshot) => {
        const posts = [];
        querySnapshot.forEach((doc) => {
            posts.push({ id: doc.id, ...doc.data() });
        });
        // Sort by creation date, newest first
        posts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        renderPosts(posts);
    }, (error) => {
        console.error("Error listening for questions:", error);
        postsContainer.innerHTML = '<div class="card"><p>Could not load questions. Please try again later.</p></div>';
    });
};


// --- EVENT LISTENERS ---
askBtn.addEventListener('click', () => submitQuestion(askInput.value));
askInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    submitQuestion(askInput.value);
  }
});
floatingBtn.addEventListener('click', () => {
  askInput.focus();
  askInput.scrollIntoView({ behavior: 'smooth' });
});

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // User is signed in.
      console.log("Authenticated user:", user.uid);
      currentUser = await getUserProfile(user.uid);
      renderUserProfile(currentUser);
      listenForQuestions(); // Start listening for questions after user is loaded
    } else {
      // User is signed out.
      console.log("No user signed in. Authenticating...");
      authenticateUser();
    }
  });
});
