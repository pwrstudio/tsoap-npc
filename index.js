const Colyseus = require("colyseus.js")
const _ = require("lodash")
const { v4: uuidv4 } = require("uuid")
const chalk = require("chalk")
const { argv } = require("yargs")

// COLYSEUS
// const client = new Colyseus.Client("ws://localhost:2567")
const client = new Colyseus.Client("wss://gameserver.tsoap.dev")

const UUID = uuidv4()
const MS_PER_FRAME = 17

// ARGS
const NAME = argv.name || "NPC"
const CATEGORY = argv.category || "no-cat"
const POINTS = argv.points ? JSON.parse(argv.points) : [{ x: 3200, y: 500 }]

console.log("___ ARGS")
console.log("______ NAME")
console.dir(NAME)
console.log("______ CATEGORY")
console.dir(CATEGORY)
console.log("______ POINTS")
console.dir(POINTS)

let POINTS_INDEX = 0

console.log("POINTS_INDEX", POINTS_INDEX)

let npcSessionId = ""
let npcObject = {}
let caseStudies = {}
let currentTarget = false
let inMotion = false

const getDistance = (startX, startY, endX, endY) =>
  Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2))

// CREATE NPC
const initNPC = {
  uuid: UUID,
  name: NAME,
  npc: true,
  avatar: "9396422c-e8ea-40ee-923d-471667c23606",
  tint: "0xff0000",
}

// CONNECT TO ROOM
client
  .join("game", initNPC)
  .then(gameRoom => {
    // PLAYER: ADD
    gameRoom.state.players.onAdd = (player, sessionId) => {
      if (player.uuid === UUID) {
        npcObject = player
        npcSessionId = sessionId
        // START WORK LOOP
        setTimeout(workLoop, 2000)
      }
      
      player.onChange = changes => {
        if (sessionId === npcSessionId) {
          npcObject = player
          if (!inMotion && player.path.waypoints.length > 0) {
            inMotion = true
            console.log(
              chalk.green(".. (player moving) =>"),
              player.path.waypoints.length,
              chalk.green("=>"),
              (player.path.waypoints.length * MS_PER_FRAME) / 1000,
              chalk.green("seconds")
            )
            setTimeout(() => {
              inMotion = false
              if (currentTarget) {
                console.log("–– 2: Pick up case study")
                gameRoom.send("pickUpCaseStudy", {
                  uuid: currentTarget.uuid,
                })
                currentTarget = false
                console.log("–– 3: Move to drop off point")
                gameRoom.send("go", {
                  x: POINTS[POINTS_INDEX].x,
                  y: POINTS[POINTS_INDEX].y,
                  originX: npcObject.x,
                  originY: npcObject.y,
                })
                // __ Circulate the destination points
                POINTS_INDEX =
                  POINTS_INDEX < POINTS.length - 1 ? POINTS_INDEX + 1 : 0
                console.log("===> POINTS_INDEX", POINTS_INDEX)
              } else {
                console.log("–– 4: Drop case study")
                gameRoom.send("dropCaseStudy", {
                  uuid: npcObject.carrying,
                })
                workLoop()
              }
            }, player.path.waypoints.length * MS_PER_FRAME)
          }
        }
      }
    }

    // CASE STUDY: ADD
    gameRoom.state.caseStudies.onAdd = (caseStudy, sessionId) => {
      caseStudies[caseStudy.uuid] = caseStudy

      caseStudies.onChange = (changes) => {
        caseStudies[caseStudy.uuid] = caseStudy
      }
    }

    // CASE STUDY: REMOVE
    gameRoom.state.caseStudies.onRemove = (caseStudy, sessionId) => {
      delete caseStudies[caseStudy.uuid]
    }

    // CASE STUDY: STATE CHANGE
    gameRoom.state.caseStudies.onChange = (caseStudy, sessionId) => {
      caseStudies[caseStudy.uuid] = caseStudy
    }

    gameRoom.onMessage("illegalMove", message => {
      console.log(chalk.red("▓▓ !! ILLEGAL MOVE:", message))
    })

    const workLoop = () => {
      console.log(chalk.green("   ***********"))
      console.log("–– 1: Move to case study")

      // FIND TARGET
      currentTarget = _.sample(
        Object.values(caseStudies).filter(
          cs =>
            (cs.carriedBy === undefined || cs.carriedBy === "") &&
            cs.category === CATEGORY
        )
      )

      if (currentTarget && currentTarget.x) {
        console.log(chalk.magenta("__ #"), Object.values(caseStudies).length)
        console.log(
          chalk.magenta("__ $"),
          Object.values(caseStudies).filter(
            cs =>
              (cs.carriedBy == undefined || cs.carriedBy == "") &&
              cs.category === CATEGORY
          ).length
        )
        console.log(chalk.blue("__ x"), currentTarget.x)
        console.log(chalk.blue("__ y"), currentTarget.y)
        console.log(
          chalk.blue("__ distance"),
          getDistance(
            npcObject.x,
            npcObject.y,
            currentTarget.x,
            currentTarget.y
          )
        )

        // MOVE TO TARGET
        gameRoom.send("go", {
          x: currentTarget.x,
          y: currentTarget.y,
          originX: npcObject.x,
          originY: npcObject.y,
        })
      } else {
        console.log(
          chalk.red(
            "▓▓ !! Case study not found. Wating 10s. Category:",
            CATEGORY
          )
        )
        setTimeout(workLoop, 10000)
      }
    }

    // GENERAL: ERROR
    gameRoom.onError((code, message) => {
      console.error(message)
    })
  })
  .catch(e => {
    console.log("GAME ROOM: JOIN ERROR", e)
  })
