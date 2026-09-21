// วาง URL ของ Web App จาก Google Apps Script ที่ได้ทำการ Deploy แล้วตรงนี้
const SCRIPT_URL = 'YOUR_WEB_APP_URL_HERE';

let state = {
    teacherPin: '',
    questions: [],
    studentData: {},
    studentAnswers: {},
    currentQIndex: 0,
    timer: null,
    warnings: 0,
    examStatus: 'ปกติ',
    isExamRunning: false
};

// ================= UI Management =================
function showScreen(screenId) {
    document.querySelectorAll('.container').forEach(el => el.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

function showLoading(show) {
    document.getElementById('loading').classList.toggle('hidden', !show);
}

// ================= API Function =================
async function callAPI(payload) {
    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        showLoading(false);
        return result;
    } catch (error) {
        showLoading(false);
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อระบบ');
        console.error(error);
        return null;
    }
}

// ================= TEACHER PORTAL =================
async function loginTeacher() {
    const pin = document.getElementById('teacher-pin').value;
    if(!pin) return alert('กรุณาใส่รหัสผ่าน');
    
    const res = await callAPI({ action: 'getQuestionsForTeacher', pin: pin });
    if(res && res.status === 'success') {
        state.teacherPin = pin;
        state.questions = res.data;
        showScreen('teacher-dashboard');
        renderTeacherList();
    } else {
        alert(res.message || 'รหัสผ่านผิดพลาด');
    }
}

function renderTeacherList() {
    const list = document.getElementById('question-list');
    list.innerHTML = '';
    if(state.questions.length === 0) return list.innerHTML = '<p>ยังไม่มีข้อสอบ</p>';

    state.questions.forEach((q, idx) => {
        list.innerHTML += `
            <div class="q-item">
                <div>
                    <strong>ข้อ ${idx + 1}: ${q.question}</strong><br>
                    <small>เวลา: ${q.timeLimit} วิ | เฉลย: ตัวเลือกที่ ${parseInt(q.correctAnswer) + 1}</small>
                </div>
                <div class="q-actions">
                    <button class="btn-secondary" onclick='editQuestion(${JSON.stringify(q)})'>แก้ไข</button>
                    <button class="btn-danger" onclick="deleteQuestion('${q.id}')">ลบ</button>
                </div>
            </div>
        `;
    });
}

function showQuestionForm() {
    document.getElementById('question-form-modal').classList.remove('hidden');
    document.getElementById('q-id').value = '';
    document.getElementById('q-text').value = '';
    document.getElementById('q-opt0').value = '';
    document.getElementById('q-opt1').value = '';
    document.getElementById('q-opt2').value = '';
    document.getElementById('q-opt3').value = '';
    document.getElementById('q-correct').value = '0';
    document.getElementById('q-time').value = '30';
    document.getElementById('form-title').innerText = 'เพิ่มข้อสอบใหม่';
}

function hideQuestionForm() {
    document.getElementById('question-form-modal').classList.add('hidden');
}

function editQuestion(q) {
    showQuestionForm();
    document.getElementById('form-title').innerText = 'แก้ไขข้อสอบ';
    document.getElementById('q-id').value = q.id;
    document.getElementById('q-text').value = q.question;
    document.getElementById('q-opt0').value = q.options[0];
    document.getElementById('q-opt1').value = q.options[1];
    document.getElementById('q-opt2').value = q.options[2];
    document.getElementById('q-opt3').value = q.options[3];
    document.getElementById('q-correct').value = q.correctAnswer;
    document.getElementById('q-time').value = q.timeLimit;
}

async function saveQuestion() {
    const qData = {
        id: document.getElementById('q-id').value,
        question: document.getElementById('q-text').value,
        options: [
            document.getElementById('q-opt0').value,
            document.getElementById('q-opt1').value,
            document.getElementById('q-opt2').value,
            document.getElementById('q-opt3').value
        ],
        correctAnswer: document.getElementById('q-correct').value,
        timeLimit: document.getElementById('q-time').value
    };

    if(!qData.question) return alert('กรุณาใส่โจทย์คำถาม');

    const action = qData.id ? 'updateQuestion' : 'addQuestion';
    const res = await callAPI({ action: action, pin: state.teacherPin, questionData: qData });
    if(res.status === 'success') {
        hideQuestionForm();
        loginTeacher(); // Refresh list
    }
}

async function deleteQuestion(id) {
    if(!confirm('ยืนยันการลบข้อสอบนี้?')) return;
    const res = await callAPI({ action: 'deleteQuestion', pin: state.teacherPin, id: id });
    if(res.status === 'success') loginTeacher(); // Refresh list
}


// ================= STUDENT & EXAM PORTAL =================
async function prepareExam() {
    const name = document.getElementById('std-name').value;
    const room = document.getElementById('std-room').value;
    const number = document.getElementById('std-number').value;

    if(!name || !room || !number) return alert('กรุณากรอกข้อมูลให้ครบถ้วน');

    state.studentData = { fullName: name, room: room, number: number };
    
    const res = await callAPI({ action: 'getQuestionsForStudent' });
    if(res && res.status === 'success') {
        if(res.data.length === 0) return alert('ครูยังไม่ได้เพิ่มข้อสอบเข้าในระบบ');
        state.questions = res.data;
        state.studentAnswers = {};
        state.currentQIndex = 0;
        state.warnings = 0;
        state.examStatus = 'ปกติ';
        
        startExam();
    }
}

function startExam() {
    // บังคับ Fullscreen
    let elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => console.log("Fullscreen ปฏิเสธการทำงานอัตโนมัติ"));
    }

    state.isExamRunning = true;
    showScreen('exam-portal');
    renderCurrentQuestion();
}

function renderCurrentQuestion() {
    if(state.currentQIndex >= state.questions.length) {
        return submitExamFinal(); // สอบเสร็จ
    }

    const q = state.questions[state.currentQIndex];
    document.getElementById('question-counter').innerText = `ข้อ ${state.currentQIndex + 1} / ${state.questions.length}`;
    document.getElementById('question-text').innerText = q.question;
    
    const optContainer = document.getElementById('options-container');
    optContainer.innerHTML = '';
    
    q.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.innerText = `${String.fromCharCode(65 + idx)}. ${opt}`; // A, B, C, D
        btn.onclick = () => selectAnswer(q.id, idx);
        optContainer.appendChild(btn);
    });

    startTimer(q.timeLimit);
}

function selectAnswer(questionId, selectedIdx) {
    clearInterval(state.timer);
    state.studentAnswers[questionId] = selectedIdx;
    state.currentQIndex++;
    renderCurrentQuestion();
}

function startTimer(seconds) {
    clearInterval(state.timer);
    let timeLeft = parseInt(seconds);
    document.getElementById('time-left').innerText = timeLeft;

    state.timer = setInterval(() => {
        timeLeft--;
        document.getElementById('time-left').innerText = timeLeft;
        if(timeLeft <= 0) {
            clearInterval(state.timer);
            // หมดเวลาถือว่าข้าม
            state.studentAnswers[state.questions[state.currentQIndex].id] = -1;
            state.currentQIndex++;
            renderCurrentQuestion();
        }
    }, 1000);
}

// ================= ANTI-CHEAT SYSTEM =================
document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.isExamRunning) {
        state.warnings++;
        
        if (state.warnings === 1) {
            document.getElementById('warning-text').innerText = "⚠️ เตือนครั้งที่ 1: ห้ามสลับหน้าจอ (พับหน้าจอ)";
            document.getElementById('cheat-warning').classList.remove('hidden');
        } else if (state.warnings === 2) {
            document.getElementById('warning-text').innerText = "⚠️ เตือนครั้งที่ 2: หากสลับอีกครั้ง ระบบจะตัดส่งข้อสอบทันที!";
            document.getElementById('cheat-warning').classList.remove('hidden');
        } else {
            // โกงครั้งที่ 3
            state.examStatus = 'ทุจริต (สลับหน้าจอเกินกำหนด)';
            document.getElementById('cheat-warning').classList.add('hidden');
            submitExamFinal(); // บังคับส่ง
        }
    }
});

// ================= SUBMIT EXAM =================
async function submitExamFinal() {
    clearInterval(state.timer);
    state.isExamRunning = false;
    
    // ออกจาก Fullscreen
    if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen();
    }

    const payload = {
        action: 'submitExam',
        studentData: state.studentData,
        answers: state.studentAnswers,
        examStatus: state.examStatus
    };

    const res = await callAPI(payload);
    
    if (res && res.status === 'success') {
        showScreen('result-screen');
        document.getElementById('score-display').innerText = `${res.score} / ${res.total}`;
        document.getElementById('status-display').innerHTML = state.examStatus === 'ปกติ' 
            ? '<span style="color:green;">ส่งสำเร็จ: ทำข้อสอบอย่างโปร่งใส</span>' 
            : `<span style="color:red;">สถานะ: ${state.examStatus}</span>`;
    }
}