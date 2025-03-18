const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron')
const Path = require('node:path')
const URL = require('node:url')
const p = require('node:util').promisify
const awaitable = require('pull-awaitable')
const { createPeer } = require('pzp-sdk')

// WARNING monkey patch sodium-native for Electron > 20.3.8
const na = require('sodium-native')
na.sodium_malloc = function sodium_malloc_monkey_patched(n) {
  return Buffer.alloc(n)
}
na.sodium_free = function sodium_free_monkey_patched() {}

process.env.PZP_VOTING_DATA ??= Path.join(app.getPath('appData'), 'pzp-voting')
app.setPath('userData', process.env.PZP_VOTING_DATA)
const path = Path.resolve(app.getPath('userData'), 'pzp')
console.log("Appdata path:", process.env.PZP_VOTING_DATA)

let mainWindow
let globalAccountName = null

// Poll data
const pollState = {
  title: '',
  options: [],
  votes: {}
}

createPeer({ path }).then(({ peer, account: globalAccountID }) => {
  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      title: 'PZP Voting',
      webPreferences: {
        preload: Path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    const startUrl =
      process.env.ELECTRON_START_URL ??
      URL.format({
        pathname: Path.join(__dirname, 'www/index.html'),
        protocol: 'file:',
        slashes: true,
      })
    mainWindow.loadURL(startUrl)

    // For development
    if (process.env.DEV_MODE) {
      mainWindow.webContents.openDevTools({ mode: 'bottom', activate: true })
    }

    // Open web URLs in default browser
    mainWindow.webContents.on('new-window', (ev, url) => {
      ev.preventDefault()
      shell.openExternal(url)
    })
  }

  async function loadAccount() {
    if (globalAccountName !== null) {
      return { id: globalAccountID, name: globalAccountName }
    }

    // Read profile
    const profile = await p(peer.dict.read)(globalAccountID, 'profile')
    const name = profile?.name ?? ''
    globalAccountName = name

    return { id: globalAccountID, name }
  }

  async function setProfileName(ev, name) {
    await p(peer.dict.update)('profile', { name })
    return name
  }

  async function createPoll(ev, { title, options }) {
    if (globalAccountID === null) throw new Error('account not loaded')
    
    pollState.title = title
    pollState.options = options
    pollState.votes = {}
    
    await p(peer.db.feed.publish)({
      account: globalAccountID,
      domain: 'votingPoll',
      data: { title, options, creator: globalAccountID }
    })
    
    return { title, options }
  }

  async function castVote(ev, option) {
    if (globalAccountID === null) throw new Error('account not loaded')
    
    const vote = {
      option,
      voter: globalAccountID,
      timestamp: Date.now()
    }
    
    await p(peer.db.feed.publish)({
      account: globalAccountID,
      domain: 'votingVote',
      data: vote
    })
    
    return vote
  }

  async function createInvite() {
    if (globalAccountID === null) throw new Error('account not loaded')
    
    let { url } = await p(peer.invite.createForFriend)({
      hubs: 1,
      id: globalAccountID,
    })
    
    // If hub is on localhost, use default port
    if (url.indexOf('0.0.0.0') !== -1) {
      url = url.replace("0.0.0.0", "0.0.0.0:3000")
    }
    
    return url
  }

  function copyToClipboard(ev, text) {
    clipboard.writeText(text)
  }

  let hasSubscribedToVoting = false
  async function subscribeToVoting() {
    if (hasSubscribedToVoting) return
    hasSubscribedToVoting = true

    // Listen for new polls
    for await (const { id: msgID, msg } of peer.db.records()) {
      if (msg.data && msg.metadata.domain === 'votingPoll') {
        pollState.title = msg.data.title
        pollState.options = msg.data.options
        
        // Notify UI
        mainWindow.webContents.send('pollUpdate', {
          title: pollState.title,
          options: pollState.options,
          votes: pollState.votes
        })
      }
      
      if (msg.data && msg.metadata.domain === 'votingVote') {
        const { option, voter } = msg.data
        
        // Count votes
        if (!pollState.votes[option]) {
          pollState.votes[option] = 0
        }
        pollState.votes[option]++
        
        // Notify UI
        mainWindow.webContents.send('voteUpdate', {
          option,
          voter,
          votes: pollState.votes
        })
      }
    }

    // Subscribe to new data
    peer.db.onRecordAdded(({ id: msgID, msg }) => {
      if (msg.data && msg.metadata.domain === 'votingPoll') {
        pollState.title = msg.data.title
        pollState.options = msg.data.options
        
        // Notify UI
        mainWindow.webContents.send('pollUpdate', {
          title: pollState.title,
          options: pollState.options,
          votes: pollState.votes
        })
      }
      
      if (msg.data && msg.metadata.domain === 'votingVote') {
        const { option, voter } = msg.data
        
        // Count votes
        if (!pollState.votes[option]) {
          pollState.votes[option] = 0
        }
        pollState.votes[option]++
        
        // Notify UI
        mainWindow.webContents.send('voteUpdate', {
          option,
          voter,
          votes: pollState.votes
        })
      }
    })

    // Start replication
    setTimeout(() => {
      peer.conductor.start(
        globalAccountID,
        [
          ['profile@dict', 'votingPoll@newest-100', 'votingVote@newest-1000', 'hubs@set'],
          ['profile@dict', 'votingPoll@newest-100', 'votingVote@newest-1000']
        ],
        64_000,
        (err) => {
          if (err) console.error('Starting conductor failed:', err)
        }
      )
    }, 32)
  }

  let hasSubscribedToConnections = false
  async function subscribeToConnections() {
    if (hasSubscribedToConnections) return
    hasSubscribedToConnections = true

    for await (const connections of awaitable(peer.net.peers())) {
      mainWindow.webContents.send('connections', connections)
    }
  }

  async function handlePZPUri(ev, uri) {
    if (!globalAccountID) {
      setTimeout(handlePZPUri, 100, null, uri)
      return
    }
    
    if (uri.startsWith("http:") || uri.startsWith("https://")) {
      uri = decodeURIComponent(uri.split('/invite#')[1])
    }
    
    if (!uri.startsWith('pzp://')) {
      return console.log('Not a pzp invite URI', uri)
    }
    
    const commands = peer.invite.parse(uri)
    
    for (const command of commands) {
      console.log('Executing command', JSON.stringify(command))
      
      switch (command.type) {
        case 'join': {
          try {
            await p(peer.hubClient.addHub)(command.multiaddr)
          } catch (err) {
            console.error('Failed to properly join hub', err)
          }
          break
        }
        case 'follow': {
          await p(peer.set.add)('follows', command.id)
          break
        }
        case 'promise.follow': {
          const [issuerType, issuerPubkey] = command.issuer
          if (issuerType !== 'pubkey') {
            throw new Error(`Don't know how to claim a ${issuerType} promise`)
          }
          
          peer.addListener('rpc:connect', function onConnect(rpc) {
            if (rpc.shse.pubkey === issuerPubkey) {
              peer.removeListener('rpc:connect', onConnect)
              rpc.promise.follow(command.token, globalAccountID, (err) => {
                if (err) return console.error('Failed to use follow promise', err)
              })
            }
          })
          break
        }
        default:
          console.log('Unknown command type', command.type)
      }
    }
  }

  // Set up protocol handler
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('pzp', process.execPath, [
        Path.resolve(process.argv[1]),
      ])
    }
  } else {
    app.setAsDefaultProtocolClient('pzp')
  }

  app.whenReady().then(() => {
    ipcMain.handle('loadAccount', loadAccount)
    ipcMain.handle('setProfileName', setProfileName)
    ipcMain.handle('createPoll', createPoll)
    ipcMain.handle('castVote', castVote)
    ipcMain.handle('createInvite', createInvite)
    ipcMain.handle('copyToClipboard', copyToClipboard)
    ipcMain.handle('consumeInvite', handlePZPUri)
    ipcMain.handle('subscribeToVoting', subscribeToVoting)
    ipcMain.handle('subscribeToConnections', subscribeToConnections)
    
    createWindow()
    
    if (process.argv.length > 1) {
      handlePZPUri(null, process.argv[process.argv.length - 1])
    }

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
    
    app.on('window-all-closed', function () {
      if (process.platform !== 'darwin') app.quit()
    })
  })
}).catch(err => console.error("Couldn't create peer:", err))