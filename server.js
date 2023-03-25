import express from 'express'
import crypto from 'crypto'
import mongoose from 'mongoose'
import cors from 'cors'
const app = express()
const port = 3000
import fetch from 'node-fetch'
// const eventId = "63f3b59791f11324dc3d29a3"
// const eventId = "640c6ba0a82bac563edf2655"
const eventId = process.env['eventId']
const roundTime = [{
    startTime: new Date(process.env['startTime']),
    endTime: new Date(process.env['endTime'])
}, {
    startTime: Date.UTC(2024, 2, 20, 10, 30, 0),
    endTime: Date.UTC(2024, 2, 20, 11, 0, 0)
}]


app.use(cors({
    origin: '*',
    optionsSuccessStatus: 200
}));
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

async function dbInit() {
    await mongoose.connect(process.env['mongoURI'])
    const Question = new mongoose.model('Question', new mongoose.Schema({
        question: {
            type: String,
            required: true
        },
        description: {
            type: String,
            required: true
        },
        points: {
            type: Number,
            required: true
        },
        testcases: [{input: String, output: String}],
        roundNo: {
            type: Number,
            required: true
        }
    }))
    const User = new mongoose.model('User', new mongoose.Schema({
        name: String,
        userId: String,
        token: String,
        points: Number,
        runsLeft: {
            type: Number,
            default: 3
        },
        startTime: [Number],
        endTime: [Number],
        questions: [String],
        qualified: {
            type: Boolean,
            default: true
        },
        email: String,
        phone: String,
        gender: String,
        dateOfBirth: String,
        college: String,
        degree: String,
        year: Number,
        stream: String,
        coins: Number,
        profileImageUrl: String
    }))
    return [Question, User]
}
const pModels = dbInit()

async function authenticateTokenUser(req) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    console.log(token)
    if(!token) return false
    const user = await (await pModels)[1].find({token: token})
    if(user) return token
    return false
}

app.get('/', function(req, res) {
    res.send({
        status: 'OK'
    })
})

const token = process.env['token']

const adminAcc = [
    {
        userId: "admin",
        hash: "hwYWBbB5F+t+hOagKMFgeorDcTm74lYcI9spoZ3e7IA="
    },
    {
        userId: ""
    }
]

async function authenticateTokenAdmin(req) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    console.log(token)
    if(!token) return false
    if(token===process.env['token']) return token
    return false
}



app.post('/admin/login', async (req, res) => {
    /*
        Admin Login endpoint expects a JSON in it's body in this format
        {
        "userId": email or whatever is used to login
        "pass": password
        }

        it will return a token which can be passed to authorised endpoints
    */
    if(!req.body) {
        res.status(400)
        res.send({
            error: "req body invalid"
        })
    }
    const userId = req.body.userId
    const hash = crypto.createHash('sha256').update(req.body.pass).digest('base64')

    for (let acc of adminAcc) {
        if(acc.userId===userId && acc.hash===hash) {
            res.send({
                token: token,
                user: {
                    userType: "admin"
                }
            })
        } else {
            res.status(401)
            res.send({
                error: "Invalid Username or Password"
            })
        }
    }
})


app.get('/questions', async (req, res) => {
    /*
    Returns all the questions as an array
    */
    const Question = (await pModels)[0]
    try {
        if(req.query.id) {
            const question = await Question.findById(req.query.id)
            console.log(question)
            res.send(question)
            return
        }
        const questions = await Question.find()
        console.log(questions)
        res.send(questions)
    } catch(error) {
        res.send({
            error: error
        })
    }
})

app.post('/questions', async (req, res) => {
    /*
    Add a question to the db, expects to follow schema but doesn't enforce it
    {
    title: String,
    points: int,
    testcases: [{input: String, output: String},...]
    roundNo: int
    }

    the request body must be
    {
    question: Question,
    token: String
    }
    */
    const question = req.body
    if(authenticateTokenAdmin(req)) {
        const Question = (await pModels)[0]
        try {
            const q = new Question(question)
            console.log(q)
            await q.save()
            res.send("Success")
        } catch (error) {
            res.status(400)
            res.send({
                error: error
            })
        }
    } else {
        res.send("Invalid Token")
    }
})

// app.post('/admin/advance', async (req, res) => {
//     /*
//     Call to move to next round, requires token to auth
//     sets qualified to false for all the users below threshold
//     */
//     if (req.body!==token) {
//         res.status(401)
//         res.send({
//             error: "Invalid Token"
//         })
//     } else {
//         const users = await (await pModels)[1].find({ points: { $gt: 50 } })
//         for (const user of users) {
//             user.qualified=false
//             await user.save()
//         }
//         res.send("Success")
//     }
// })

app.post('/user/login', async (req, res) => {
    /*
    Login endpoint for users, expects a JSON in it's body in this format
    {
    "userId": for now, is espektro id, will be changed to email,
    "password": password
    }
    */
    const userId = req.body.userId
    const password = req.body.password
    const User = (await pModels)[1]
    const resp = await fetch(`https://tessarus-staging.gdsckgec.in/api/events/checkin/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            eventId: eventId,
            espektroId: userId,
            password: password
        })
    })
    const respJson = await resp.json()
    if(!respJson.user) {
        console.log(respJson)
        res.status(500)
        res.send({ error: "Invalid Credentials"})
        return
    }
    const user = respJson.user
    const userInDB = await User.findById(user._id)
    if(userInDB) {
        res.send({
            token: userInDB.token
        })
    } else {
        const newUser = new User({
            _id: user._id,
            name: user.name,
            userId: user.espektroId,
            token: crypto.randomBytes(16).toString('base64'),
            points: 0,
            startTime: [],
            endTime: [],
            questionsCompleted: [],
            email: user.email,
            phone: user.phone,
            gender: user.gender,
            dateOfBirth: user.dateOfBirth,
            college: user.college,
            degree: user.degree,
            year: user.year,
            stream: user.stream,
            coins: user.coins,
            profileImageUrl: user.profileImageUrl
        })
        await newUser.save()
        res.send({
            token: newUser.token
        })
    }

})

app.get('/user/get', async (req, res) => {
    /* Get the user details */
    const token = await authenticateTokenUser(req)
    if (!token) {
        res.status(401)
        res.send({
            error: "No Token"
        })
        return
    }
    const User = (await pModels)[1]
    try {
        const user =await User.find({ token: token })
        console.log(user)
        res.send(user)
    } catch {
        res.status(401)
        res.send({
            error: "Invalid Token"
        })
    }
})

app.post('/user/start', async (req, res) => {
    const token = await authenticateTokenUser(req)
    if (!token) {
        res.status(401)
        res.send({
            error: "No Token"
        })
        return
    }
    const { roundNo } = req.body
    const [Question, User] = await pModels

    if(Date.now() < roundTime[roundNo-1].startTime) {
        console.log(roundTime[roundNo-1].startTime)
        res.status(401)
        res.send({
            error: "Round not started"
        })
        return
    }

    try {
        const user = (await User.find({ token: token }))[0]
        console.log(user)
        if(!user.qualified) {
            res.status(401)
            res.send({
                error: "User not qualified"
            })
            return
        }
        // if(user.startTime[roundNo-1]) {
        //     res.status(401)
        //     res.send({
        //         error: "User already started the round"
        //     })
        //     return
        // }
        user.startTime[roundNo-1] = Date.now()
        // Get a random question from the round
        const question = await Question.find({ roundNo: roundNo }).skip(Math.floor(Math.random() * await Question.countDocuments({ roundNo: roundNo }))).limit(1)
        user.questions[roundNo-1] = question[0]._id
        console.log(user)
        await user.save()
        res.send(question)
    } catch(error) {
        console.log(error)
        res.status(401)
        res.send({
            error: error
        })
    }
})

app.post('/user/run', async (req, res) => {
    const token = await authenticateTokenUser(req)
    if (!token) {
        res.status(401)
        res.send({
            error: "No Token"
        })
        return
    }

    const User = (await pModels)[1]
    const user = (await User.find({ token: token }))[0]
    if(!user) {
        res.status(401)
        res.send({
            error: "Invalid Token"
        })
    }
    if(user.runsLeft <= 0) {
        res.status(401)
        res.send({
            error: "No runs left"
        })
        return
    } else {
        user.runsLeft--
        await user.save()
    }
    // const { source_code, language_id, stdin } = req.body
    console.log(req.body)
    const judge = 'http://18.138.227.89:2358'
    try {
        const resp = await fetch(`${ judge }/submissions/?base64_encoded=true&wait=true`, {
            method: 'POST',
            body: JSON.stringify(req.body),
	        headers: {'Content-Type': 'application/json'}
        })
        const respJson = await resp.json()
        console.log(respJson)
        res.send(respJson)
    } catch {
        res.status(500)
        res.send({
            error: "Judge is down"
        })
    }
    
})

app.post('/user/disqualify', async (req, res) => {
    const token = await authenticateTokenUser(req)
    if (!token) {
        res.status(401)
        res.send({
            error: "No Token"
        })
        return
    }
    const [_, User] = await pModels

    try {
        const user = (await User.find({ token: token }))[0]
        user.qualified = false
        await user.save()
        res.send({
            message: "User disqualified"
        })
    } catch(error) {
        console.log(error)
        res.status(401)
        res.send({
            error: error
        })
    }
})

app.post('/user/submit', async (req, res) => {
    const token = await authenticateTokenUser(req)
    console.log(token)
    if (!token) {
        res.status(401)
        res.send({
            error: "No Token"
        })
        return
    }
    const { code, langId } = req.body
    const roundNo = req.body.roundNo - 1
    const [Question, User] = await pModels

    if(Date.now() > roundTime[roundNo].endTime) {
        res.status(401)
        res.send({
            error: "Round has already ended"
        })
        return
    }


        const user = (await User.find({ token: token }))[0]
        if(Date.now() - user.startTime[roundNo] > 3600000) {
            res.status(401)
            res.send({
                error: "Time limit exceeded"
            })
            return
        }
        // console.log(user)
        if(!user.qualified) {
            res.status(401)
            res.send({
                error: "User not qualified"
            })
            return
        }
        if(user.endTime[roundNo]) {
            res.status(401)
            res.send({
                error: "User has submitted the round"
            })
            return
        }
        user.endTime[roundNo] = Date.now()
        const judge = 'https://judge0-new.gdsckgec.in/'
        const q = await Question.findById(user.questions[roundNo])
        let correct=0
        try {
            for(let i=0; i<q.testcases.length; i++){
                const reqBody = {
                    source_code: code,
                    language_id: langId,
                    stdin: Buffer.from(q.testcases[i].input).toString('base64'),
                    expected_output: Buffer.from(q.testcases[i].output).toString('base64')
                }
                console.log(reqBody)
                const resp = (await (await fetch(`${ judge }/submissions/?base64_encoded=true&wait=true`, {
                    method: 'POST',
                    body: JSON.stringify(reqBody),
	               headers: {'Content-Type': 'application/json'}
                })).json())
                console.log(resp)
                if(resp.status.id == 3) correct++
            }
        
    } catch (error) {
            console.error(error)
        res.status(500)
        res.send({
            error: error
        })
        return
    }
        user.points = (correct*100)/q.testcases.length
        if(user.points>50) {
            user.qualified = true
        } else {
            user.qualified = false
        }
        await user.save()
        res.send(user)
})

app.get('/leaderboard/:roundNo', async (req, res) => {
    const User = (await pModels)[1]
    const roundNo = req.params.roundNo-1
    const users = await User.find()
    users.sort((a, b) => {
        if(a.points > b.points) {
            return 1
        } else if(a.points < b.points) {
            return -1
        } else {
            if(a.endTime[roundNo] - a.startTime[roundNo] > b.endTime[roundNo] - b.startTime[roundNo]) {
                return 1
            } else {
                return -1
            }
        }
    })

    res.send(users.filter(user => user.endTime[roundNo] && user.qualified))
})

app.listen(port, () => {
  console.log(`Hello world app listening on port ${port}!`)
})
