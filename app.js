// app.js - Logic for index.html

import {
  auth, db, appId, doc, getDoc, setDoc, collection, addDoc, query, onSnapshot,
  serverTimestamp, onAuthStateChanged, authenticateUser, where, runTransaction, increment,
  setAuthPersistence
} from './firebase-config.js';

// --- STATE ---
let currentUser = null;

// --- DOM ELEMENTS ---
let postsContainer, askInput, tagsInput, askBtn;

// --- UI RENDERING ---
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

const renderPosts = (posts) => {
  if (!postsContainer) return;
  
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

// --- FIRESTORE & APP LOGIC ---
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
    };
    await setDoc(userRef, newUser).catch(e => console.error("Error creating user profile:", e));
    userSnap = await getDoc(userRef);
  }
  return { id: userSnap.id, ...userSnap.data() };
};

const submitQuestion = async () => {
  const title = askInput.value.trim();
  if (!title) { alert("Question cannot be empty."); return; }
  if (!currentUser) { alert("You must be logged in to ask a question."); return; }

  const tags = tagsInput ? tagsInput.value.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

  try {
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
    askInput.value = '';
    if (tagsInput) tagsInput.value = '';
  } catch (error) {
    console.error("Firestore Write Error in submitQuestion:", error);
    alert("Error: Could not submit your question. Please check the console for details.");
  }
};

const handleVote = async (questionId, voteType) => {
    if (!currentUser) { alert("You must be logged in to vote."); return; }
    
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

            if (currentVote === voteType) {
                if (voteType === 'up') upvoteIncrementValue = -1;
                else downvoteIncrementValue = -1;
                transaction.delete(voteRef);
            } else {
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

const listenForQuestions = () => {
    const q = query(collection(db, `artifacts/${appId}/public/data/questions`));
    onSnapshot(q, (querySnapshot) => {
        const posts = [];
        querySnapshot.forEach((doc) => {
            posts.push({ id: doc.id, ...doc.data() });
        });
        posts.sort((a, b) => {
            const aVotes = a.voteCount || 0;
            const bVotes = b.voteCount || 0;
            if (aVotes !== bVotes) {
                return bVotes - aVotes;
            }
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
        });
        renderPosts(posts);
    }, (error) => {
        console.error("Error listening for questions:", error);
    });
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  postsContainer = document.getElementById('posts-container');
  askInput = document.getElementById('ask-input');
  tagsInput = document.getElementById('tags-input');
  askBtn = document.getElementById('ask-btn');

  if (askBtn) {
    askBtn.addEventListener('click', submitQuestion);
  }

  if (askInput) {
    askInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitQuestion();
      }
    });
  }

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
        prompt('Copy this link:', url);
      });
    }
  });

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("Authentication successful. User UID:", user.uid);
      currentUser = await getUserProfile(user.uid);
      renderUserProfile(currentUser);
      listenForQuestions();
    } else {
      console.log("No user authenticated. Setting persistence and attempting to sign in...");
      await setAuthPersistence();
      authenticateUser();
    }
  });
});
