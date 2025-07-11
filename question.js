// question.js

import {
  auth, db, appId, doc, getDoc, collection, addDoc, query, onSnapshot,
  serverTimestamp, onAuthStateChanged, authenticateUser, where, increment, runTransaction
} from './firebase-config.js';

// --- STATE ---
let currentUser = null;
const urlParams = new URLSearchParams(window.location.search);
const questionId = urlParams.get('id');

// --- DOM ELEMENTS ---
const questionContainer = document.getElementById('question-container');
const answersContainer = document.getElementById('answers-container');
const answerCountHeader = document.getElementById('answer-count');
const answerInput = document.getElementById('answer-input');
const answerSubmitBtn = document.getElementById('answer-submit-btn');

// --- UI RENDERING ---
const renderQuestion = (post) => {
    const postDate = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleString() : 'Just now';
    const tagsHTML = (post.tags || []).map(tag => `<span class="tag">#${tag}</span>`).join('');

    questionContainer.innerHTML = `
        <div class="post-header">
            <div class="anonymous-icon">${post.authorInitial || '?'}</div>
            <div>
                <p class="post-meta"><strong><a href="profile.html?id=${post.authorId}">${post.authorHandle || 'anonymous'}</a></strong></p>
                <p class="post-meta">Asked ${postDate}</p>
            </div>
        </div>
        <h2 class="post-title" style="font-size: 1.8rem;">${post.title}</h2>
        <div class="post-tags">${tagsHTML}</div>
        <div class="post-footer">
            <button class="post-action-btn"><i class="fas fa-arrow-up"></i> ${post.upvotes || 0}</button>
            <button class="post-action-btn"><i class="fas fa-arrow-down"></i> ${post.downvotes || 0}</button>
            <button class="post-action-btn report-btn" data-id="${post.id}" data-type="question"><i class="far fa-flag"></i> Report</button>
        </div>
    `;
};

const renderAnswersAndComments = (answers, comments) => {
    answerCountHeader.textContent = `${answers.length} Answer${answers.length !== 1 ? 's' : ''}`;
    
    if (answers.length === 0) {
        answersContainer.innerHTML = '<div class="card"><p>No answers yet. Be the first to contribute!</p></div>';
        return;
    }

    // Group comments by their parent ID for easy lookup
    const commentsByParent = comments.reduce((acc, comment) => {
        (acc[comment.parentId] = acc[comment.parentId] || []).push(comment);
        return acc;
    }, {});

    answersContainer.innerHTML = answers.map(answer => {
        const answerDate = answer.createdAt ? new Date(answer.createdAt.seconds * 1000).toLocaleString() : 'Just now';
        const answerComments = commentsByParent[answer.id] || [];
        
        return `
            <div class="answer-card" id="answer-${answer.id}">
                <div class="post-header">
                    <div class="anonymous-icon">${answer.authorInitial || '?'}</div>
                    <div>
                        <p class="post-meta"><strong><a href="profile.html?id=${answer.authorId}">${answer.authorHandle || 'anonymous'}</a></strong></p>
                        <p class="post-meta">Answered ${answerDate}</p>
                    </div>
                </div>
                <div class="answer-text">${answer.text}</div>
                <div class="comment-section">
                    ${answerComments.map(comment => `
                        <div class="comment-card">
                            <p class="comment-text">
                                <strong><a href="profile.html?id=${comment.authorId}">${comment.authorHandle}</a></strong>: 
                                ${comment.text}
                            </p>
                        </div>
                    `).join('')}
                    <div class="comment-form">
                        <input type="text" class="comment-input" placeholder="Add a comment..." data-parent-id="${answer.id}" data-parent-type="answer">
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

// --- FIRESTORE & APP LOGIC ---
const loadQuestionData = async () => {
    if (!questionId) {
        questionContainer.innerHTML = "<h1>Question not found</h1>";
        return;
    }

    // 1. Get Question
    const questionRef = doc(db, `artifacts/${appId}/public/data/questions`, questionId);
    const questionSnap = await getDoc(questionRef);
    if (questionSnap.exists()) {
        renderQuestion({ id: questionSnap.id, ...questionSnap.data() });
    } else {
        questionContainer.innerHTML = "<h1>Question not found</h1>";
        return;
    }

    // 2. Get Answers
    const answersQuery = query(collection(db, `artifacts/${appId}/public/data/answers`), where("questionId", "==", questionId));
    
    // 3. Get Comments
    const commentsQuery = query(collection(db, `artifacts/${appId}/public/data/comments`), where("questionId", "==", questionId));

    const [answersSnapshot, commentsSnapshot] = await Promise.all([getDocs(answersQuery), getDocs(commentsQuery)]);
    
    const answers = answersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const comments = commentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    answers.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    comments.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

    renderAnswersAndComments(answers, comments);
};

const submitAnswer = async () => {
    const text = answerInput.value.trim();
    if (!text || !currentUser || !questionId) return;

    const questionRef = doc(db, `artifacts/${appId}/public/data/questions`, questionId);
    
    await runTransaction(db, async (transaction) => {
        const newAnswerRef = doc(collection(db, `artifacts/${appId}/public/data/answers`));
        transaction.set(newAnswerRef, {
            text,
            questionId,
            authorId: currentUser.id,
            authorHandle: currentUser.userIdHandle,
            authorInitial: currentUser.username.charAt(0).toUpperCase(),
            createdAt: serverTimestamp(),
            commentCount: 0,
        });
        transaction.update(questionRef, { answerCount: increment(1) });
    });
    
    answerInput.value = '';
    loadQuestionData(); // Refresh data
};

const submitComment = async (text, parentId, parentType) => {
    if (!text || !currentUser || !questionId) return;

    const parentRef = doc(db, `artifacts/${appId}/public/data/${parentType}s`, parentId);

    await runTransaction(db, async (transaction) => {
        const newCommentRef = doc(collection(db, `artifacts/${appId}/public/data/comments`));
        transaction.set(newCommentRef, {
            text,
            questionId,
            parentId,
            parentType,
            authorId: currentUser.id,
            authorHandle: currentUser.userIdHandle,
            createdAt: serverTimestamp(),
        });
        transaction.update(parentRef, { commentCount: increment(1) });
    });
    
    loadQuestionData(); // Refresh data
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    answerSubmitBtn.addEventListener('click', submitAnswer);

    answersContainer.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && e.target.classList.contains('comment-input')) {
            const input = e.target;
            const text = input.value.trim();
            if (text) {
                submitComment(text, input.dataset.parentId, input.dataset.parentType);
                input.value = '';
            }
        }
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(db, `artifacts/${appId}/users`, user.uid));
            currentUser = { id: user.uid, ...userDoc.data() };
            document.getElementById('user-avatar-link').textContent = currentUser.username.charAt(0).toUpperCase();
            loadQuestionData();
        } else {
            authenticateUser();
        }
    });
});
