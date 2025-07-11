// app.js - Logic for index.html

import {
  auth, db, appId, doc, getDoc, setDoc, collection, addDoc, query, onSnapshot,
  serverTimestamp, onAuthStateChanged, authenticateUser, where, runTransaction, increment,
  setAuthPersistence // Import the new function
} from './firebase-config.js';

// --- STATE ---
let currentUser = null;

// --- DOM ELEMENTS ---
// These will be assigned once the DOM is loaded.
let postsContainer, askInput, tagsInput, askBtn, floatingBtn, recaptchaContainer;

// --- UI RENDERING FUNCTIONS ---

/**
 * Renders the user's profile information in the sidebar and header.
 * @param {object} userData - The user data from Firestore.
 */
const renderUserProfile = (userData) => {
  if (!userData) return;
  const userInitial = userData.username.charAt(0).toUpperCase();
  const sidebarProfileImg = document.getElementById('sidebar-profile-img');
  if (sidebarProfileImg) sidebarProfileImg.textContent = userInitial;
  
  const sidebarProfileName = document.getElementById('sidebar-profile-name');
  if (sidebarProfileName) sidebarProfileName.textContent = userData.username;

  const sidebarProfileHandle = document.getElementById('sidebar-profile-handle');
  if (sidebarProfileHandle) sidebarProfileHandle.textContent = userData.userIdHandle;

  const sidebarFollowersCount = document.getElementById('sidebar-followers-count');
  if (sidebarFollowersCount) sidebarFollowersCount.textContent = userData.followersCount || 0;

  const sidebarFollowingCount = document.getElementById('sidebar-following-count');
  if (sidebarFollowingCount) sidebarFollowingCount.textContent = userData.followingCount || 0;

  const userAvatarLink = document.getElementById('user-avatar-link');
  if (userAvatarLink) userAvatarLink.textContent = userInitial;
};

/**
 * Renders a list of question posts in the main feed.
 * @param {Array<object>} posts - An array of question objects from Firestore.
 */
const renderPosts = (posts) => {
  if (!postsContainer) return; // Guard against null element
  
  if (posts.length === 0) {
    postsContainer.innerHTML = '<div class="card"><p>No questions have been asked yet. Be the first!</p></div>';
    return;
  }

  postsContainer.innerHTML = posts.map(post => {
    const postDate = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString() : 'Just now';
    const tagsHTML = (post.tags || []).map(tag => `<span class="tag">#${tag}</span>`).join('');
    
    return `
      <div class="post-card card" id="post-${post.id}">
        <a href="question.html?id=${post.id}" class="post-link">
          <div class="post-header">
            <div class="anonymous-icon">${post.authorInitial || '?'}</div>
            <div>
              <p class="post-meta"><strong>${post.authorHandle || 'anonymous'}</strong></p>
              <p class="post-meta">Asked ${postDate}</p>
            </div>
          </div>
          <h2 class="post-title">${post.title}</h2>
          <div class="post-tags">${tagsHTML}</div>
        </a>
        <div class="post-footer">
          <button class="post-action-btn vote-btn" data-vote="up" data-id="${post.id}">
            <i class="fas fa-arrow-up"></i> <span id="upvotes-${post.id}">${post.upvotes || 0}</span>
          </button>
          <button class="post-action-btn vote-btn" data-vote="down" data-id="${post.id}">
            <i class="fas fa-arrow-down"></i> <span id="downvotes-${post.id}">${post.downvotes || 0}</span>
          </button>
          <a href="question.html?id=${post.id}#comments" class="post-action-btn">
            <i class="fas fa-comment"></i> ${post.commentCount || 0} Comments
          </a>
          <button class="post-action-btn share-btn" data-id="${post.id}"><i class="fas fa-share"></i> Share</button>
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
    console.log("Creating new user profile for UID:", uid);
    const shortId = uid.substring(0, 6);
    const newUser = {
      username: `Anonymous #${shortId}`,
      userIdHandle: `@anon_${shortId}`,
      createdAt: serverTimestamp(),
      followersCount: 0,
      followingCount: 0,
      hasPostedQuestion: false // New field to track first post
    };
    await setDoc(userRef, newUser).catch(e => console.error("Error creating user profile:", e));
    userSnap = await getDoc(userRef); // Re-fetch the document to get server-generated timestamp
  }
  return { id: userSnap.id, ...userSnap.data() };
};

/**
 * Submits a new question to Firestore.
 */
const submitQuestion = async () => {
  const title = askInput.value.trim();
  if (!title) { 
    alert("Question cannot be empty."); 
    return; 
  }
  if (!currentUser) { 
    alert("You must be logged in to ask a question."); 
    return; 
  }

  // reCAPTCHA check for first-time posters
  if (!currentUser.hasPostedQuestion) {
    const recaptchaResponse = grecaptcha.getResponse();
    if (recaptchaResponse.length === 0) {
      alert("Please complete the reCAPTCHA before posting your first question.");
      return;
    }
  }

  const tags = tagsInput ? tagsInput.value.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

  try {
    // Add the question to Firestore
    await addDoc(collection(db, `artifacts/${appId}/public/data/questions`), {
      title,
      tags,
      authorId: currentUser.id,
      authorHandle: currentUser.userIdHandle,
      authorInitial: currentUser.username.charAt(0).toUpperCase(),
      createdAt: serverTimestamp(),
      upvotes: 0,
      downvotes: 0,
      voteCount: 0,
      commentCount: 0,
    });

    // If successful, update the user's profile to mark them as a poster
    const userRef = doc(db, `artifacts/${appId}/users`, currentUser.id);
    await setDoc(userRef, { hasPostedQuestion: true }, { merge: true });

    askInput.value = ''; // Clear input on success
    if (tagsInput) tagsInput.value = '';
    if (recaptchaContainer) recaptchaContainer.style.display = 'none'; // Hide reCAPTCHA after success

  } catch (error) {
    console.error("Firestore Write Error in submitQuestion:", error);
    alert("Error: Could not submit your question. Please check the console for details. This is often a security rule issue.");
  }
};

/**
 * Handles voting on questions with transaction support.
 * @param {string} questionId - The ID of the question to vote on.
 * @param {string} voteType - Either 'up' or 'down'.
 */
const handleVote = async (questionId, voteType) => {
    if (!currentUser) { 
        alert("You must be logged in to vote."); 
        return; 
    }
    
    const voteRef = doc(db, `artifacts/${appId}/users/${currentUser.id}/votes`, questionId);
    const questionRef = doc(db, `artifacts/${appId}/public/data/questions`, questionId);

    try {
        await runTransaction(db, async (transaction) => {
            const voteDoc = await transaction.get(voteRef);
            const questionDoc = await transaction.get(questionRef);
            if (!questionDoc.exists()) throw "Question does not exist!";

            const currentVote = voteDoc.exists() ? voteDoc.data().type : null;
            let upvoteIncrementValue = 0;
            let downvoteIncrementValue = 0;

            if (currentVote === voteType) { // Undoing vote
                if (voteType === 'up') upvoteIncrementValue = -1;
                else downvoteIncrementValue = -1;
                transaction.delete(voteRef);
            } else { // New vote or changing vote
                if (currentVote === 'up') upvoteIncrementValue = -1;
                if (currentVote === 'down') downvoteIncrementValue = -1;
                if (voteType === 'up') upvoteIncrementValue += 1;
                if (voteType === 'down') downvoteIncrementValue += 1;
                transaction.set(voteRef, { type: voteType });
            }
            
            transaction.update(questionRef, { 
                upvotes: increment(upvoteIncrementValue),
                downvotes: increment(downvoteIncrementValue),
                voteCount: increment(upvoteIncrementValue - downvoteIncrementValue)
            });
        });
    } catch (e) {
        console.error("Vote transaction failed: ", e);
        alert("Error: Could not process your vote. Please check the console for details.");
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
        // Sort by vote count (popularity), then by creation date
        posts.sort((a, b) => {
            const aVotes = a.voteCount || 0;
            const bVotes = b.voteCount || 0;
            if (aVotes !== bVotes) {
                return bVotes - aVotes; // Higher vote count first
            }
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0); // Newer first
        });
        renderPosts(posts);
    }, (error) => {
        console.error("Error listening for questions:", error);
        postsContainer.innerHTML = '<div class="card"><p>Could not load questions. Please try again later.</p></div>';
    });
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  // Assign DOM elements now that they exist
  postsContainer = document.getElementById('posts-container');
  askInput = document.getElementById('ask-input');
  tagsInput = document.getElementById('tags-input');
  askBtn = document.getElementById('ask-btn');
  floatingBtn = document.querySelector('.floating-btn');
  recaptchaContainer = document.getElementById('recaptcha-container');

  // --- EVENT LISTENERS ---
  if (askBtn) {
    askBtn.addEventListener('click', submitQuestion);
  }

  if (askInput) {
    askInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { // Submit on enter, unless shift is held
        e.preventDefault();
        submitQuestion();
      }
    });
  }

  // Optional floating button support
  if (floatingBtn) {
    floatingBtn.addEventListener('click', () => {
      askInput.focus();
      askInput.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Delegated event listeners for dynamic content
  document.addEventListener('click', (e) => {
    if (e.target.closest('.vote-btn')) {
      const btn = e.target.closest('.vote-btn');
      handleVote(btn.dataset.id, btn.dataset.vote);
    }
    if (e.target.closest('.share-btn')) {
      const btn = e.target.closest('.share-btn');
      const url = `${window.location.origin}/question.html?id=${btn.dataset.id}`;
      navigator.clipboard.writeText(url).then(() => {
        alert('Link copied to clipboard!');
      }).catch(() => {
        // Fallback for browsers that don't support clipboard API
        prompt('Copy this link:', url);
      });
    }
  });

  // --- AUTHENTICATION ---
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("Authentication successful. User UID:", user.uid);
      currentUser = await getUserProfile(user.uid);
      renderUserProfile(currentUser);
      listenForQuestions(); // Start listening for questions after user is loaded

      // Show reCAPTCHA if the user has not posted before
      if (recaptchaContainer && !currentUser.hasPostedQuestion) {
        recaptchaContainer.style.display = 'block';
      }

    } else {
      console.log("No user authenticated. Setting persistence and attempting to sign in...");
      // Set persistence before signing in
      await setAuthPersistence();
      authenticateUser();
    }
  });
});
