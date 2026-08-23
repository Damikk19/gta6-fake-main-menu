'use strict'

/* Pictures are centred by default, because the crop that suits one photo ruins
   another. A framing.json in the artwork folder overrides this per slot. */
const DEFAULT_FRAME = { op: '50% 50%', zoom: 1 }

/* Served by the main process from the user's artwork folder. No third-party
   image ships inside the build. */
const IMG = {
  newGame:      'art://new-game',
  continue:     'art://continue',
  progress:     'art://progress',
  settings:     'art://settings',
  collectibles: 'art://collectibles'
}

const TABS = {
  story: {
    label: 'Story',
    start: { col: 1, row: 0 },
    tiles: [
      { slot:'a', col:0, row:0, id:'newGame', label:'NEW GAME', img:IMG.newGame, key:'new-game', kicker:'NEW GAME', title:'Begin a New Story', act:'confirmNew' },
      { slot:'b', col:1, row:0, id:'continue', label:'CONTINUE', img:IMG.continue, key:'continue', kicker:'CONTINUE', title:'Air Station - Break In', chip:'16.9%', act:'load', mode:'story' },
      { slot:'c', col:2, row:0, id:'settings', label:'SETTINGS', img:IMG.settings, key:'settings', rowSpan:2,
        kicker:'SETTINGS', title:'Display, Audio & Controls', act:'settings' },
      { slot:'d', col:0, row:1, id:'collectibles', label:'COLLECTIBLES', img:IMG.collectibles, key:'collectibles', kicker:'COLLECTIBLES', title:'Statues, Rumors & Signals', chip:'12/145', act:'stats', data:'collectibles' },
      { slot:'e', col:1, row:1, id:'progress', label:'PROGRESS', img:IMG.progress, key:'progress', kicker:'PROGRESS', title:'Story Completion', chip:'16.9%', act:'stats', data:'progress' }
    ]
  },
  online: {
    label: 'Online',
    start: { col: 1, row: 0 },
    tiles: [
      { slot:'a', col:0, row:0, id:'quickJoin', label:'QUICK JOIN', img:IMG.progress, key:'progress', kicker:'QUICK JOIN', title:'Find a Public Session', act:'load', mode:'online' },
      { slot:'b', col:1, row:0, id:'playOnline', label:'PLAY ONLINE', img:IMG.continue, key:'continue', kicker:'PLAY ONLINE', title:'Vice City - Free Mode', chip:'RANK 1', act:'load', mode:'online' },
      { slot:'c', col:2, row:0, id:'character', label:'CHARACTER', img:IMG.settings, key:'settings', rowSpan:2,
        kicker:'CHARACTER', title:'Create & Customize', act:'stats', data:'character' },
      { slot:'d', col:0, row:1, id:'creator', label:'CREATOR', img:IMG.collectibles, key:'collectibles', kicker:'CREATOR', title:'Build Your Own Jobs', act:'load', mode:'creator' },
      { slot:'e', col:1, row:1, id:'crew', label:'CREW', img:IMG.newGame, key:'new-game', kicker:'CREW', title:'Find or Start a Crew', act:'dialog', data:'crew' }
    ]
  }
}

const E = (name, desc, options, i) => ({ name, desc, type:'enum', options, i })
const P = (name, desc, v, step) => ({ name, desc, type:'pct', v, step: step || 5 })

const SETTINGS = [
  { label:'DISPLAY', rows:[
    E('Screen Type','Choose how Grand Theft Auto VI fills your display.',['Fullscreen','Borderless Window','Windowed'],0),
    E('Resolution','Rendering resolution. Higher values are sharper but more demanding.',['3840 x 2160','2560 x 1440','1920 x 1080','1280 x 720'],1),
    E('Refresh Rate','Refresh rate used in fullscreen mode.',['120 Hz','60 Hz','30 Hz'],1),
    E('VSync','Synchronizes the frame rate with your display to remove tearing.',['Off','On','Adaptive'],1),
    E('HDR','High dynamic range output. Requires a compatible display.',['Off','On'],1),
    P('Brightness','Adjust until the darker logo is barely visible.',50),
    P('Safe Zone','Shrinks the interface so it fits inside your screen edges.',95)
  ]},
  { label:'GRAPHICS', rows:[
    E('Graphics Preset','Applies a group of settings tuned for your hardware.',['Custom','Performance','Balanced','Quality','Ultra'],3),
    E('Texture Quality','Detail level of surface textures. Uses more video memory.',['Low','Normal','High','Very High'],3),
    E('Shadow Quality','Resolution and draw distance of dynamic shadows.',['Low','Normal','High','Very High'],2),
    E('Reflection Quality','Detail of reflections on water, glass and vehicles.',['Low','Normal','High','Ultra'],2),
    E('Ray Tracing','Hardware ray tracing. Significant performance cost.',['Off','Reflections Only','Reflections & Shadows','Full'],2),
    E('Ambient Occlusion','Adds contact shadows where surfaces meet.',['Off','SSAO','HBAO+'],2),
    E('Anti-Aliasing','Smooths jagged edges along geometry.',['Off','FXAA','TAA','DLAA'],2),
    P('Motion Blur','Amount of blur applied to fast camera movement.',35),
    E('Depth of Field','Blurs the background during cutscenes and aiming.',['Off','On'],1)
  ]},
  { label:'AUDIO', rows:[
    P('Master Volume','Overall volume for the entire game.',80),
    P('Sound Effects','Volume of world, weapon and vehicle sounds.',75),
    P('Music Volume','Volume of the score and radio stations.',60),
    P('Dialogue Volume','Volume of character speech and phone calls.',90),
    E('Radio Station','Station selected when you enter a vehicle.',['Auto','Off','Vice Sound FM','Kult 101','Bayside Bounce'],0),
    E('Output Format','Match this to your speakers or headphones.',['Stereo','Headphones','Surround 5.1','Surround 7.1'],1),
    E('Voice Chat','How your microphone is transmitted in Online.',['Off','Push to Talk','Open Mic'],1)
  ]},
  { label:'CONTROLS', rows:[
    E('Controller Layout','Rearranges the stick and button assignments.',['Standard','Southpaw','Alternate','Custom'],0),
    E('Aim Assist','Strength of targeting help when aiming with a controller.',['Off','Low','Medium','High'],2),
    P('Look Sensitivity','Speed of the camera when looking around.',45),
    P('Aim Sensitivity','Speed of the camera while aiming down sights.',40),
    E('Vibration','Controller rumble feedback.',['Off','On'],1),
    E('Invert Look','Flips the vertical camera axis.',['Off','On'],0),
    E('Auto-Center Camera','Camera returns behind the vehicle while driving.',['Off','On'],1)
  ]},
  { label:'ACCESSIBILITY', rows:[
    E('Subtitles','Show subtitles for dialogue and phone calls.',['Off','On'],1),
    E('Subtitle Size','Size of the subtitle text.',['Small','Medium','Large'],1),
    E('Colorblind Mode','Adjusts interface colors for color vision deficiency.',['Off','Protanopia','Deuteranopia','Tritanopia'],0),
    E('Sprint','Hold the button to sprint, or press once to toggle.',['Hold','Toggle'],0),
    E('Screen Narration','Reads menu items out loud as you move through them.',['Off','On'],0),
    P('Camera Shake','Amount of camera shake during impacts and explosions.',100)
  ]},
  { label:'ONLINE', rows:[
    E('Session Privacy','Who can join the session you are playing in.',['Public','Friends','Crew','Invite Only'],0),
    E('Crossplay','Play with people on other platforms.',['Off','On'],1),
    E('Text & Voice Chat','Who can reach you in Online sessions.',['Everyone','Friends Only','Off'],0),
    E('Notifications','Which alerts appear while you are playing.',['All','Friends Only','None'],0),
    E('Data Sharing','Share gameplay data to help improve the game.',['Off','On'],1)
  ]}
]

const STATS = {
  progress: { title:'PROGRESS', big:'16.9%', sub:'Total Completion', rows:[
    ['Story Missions',13,76],['Strangers & Freaks',2,21],['Heists',1,9],['Random Events',7,45],
    ['Properties Owned',1,24],['Vehicles Owned',4,312],['Weapons Unlocked',11,58],['Collectibles',12,145]
  ]},
  collectibles: { title:'COLLECTIBLES', big:'12/145', sub:'Collectibles Found', rows:[
    ['Hidden Signals',3,40],['Gator Statues',2,30],['Beach Litter',4,25],
    ['Street Art Tags',1,20],['Buried Stashes',0,15],['Vintage Postcards',2,15]
  ]},
  character: { title:'CHARACTER', big:'1', sub:'Online Rank', rows:[
    ['Reputation',0,800],['Missions Completed',0,64],['Races Won',0,30],
    ['Money','$2,500',null],['K/D Ratio','0.00',null],['Time Played','0h 00m',null]
  ]}
}

/* Everything a viewer is likely to want to personalise, overridable from a
   content.json in the artwork folder so a downloaded build can be edited too. */
const PROFILE = {
  name: 'Player',
  rank: 1,
  crew: 'No Crew',
  memberSince: '2013',
  playersOnline: 1247392,
  lastPlayed: 'Today'
}

const SOCIAL = {
  friends: [
    ['Kacper_2137', 'Online — Vice City'],
    ['xNoScopeMarek', 'Online — Free Mode'],
    ['Dominik.exe', 'Online — Creator'],
    ['bartek_gtav', 'Offline — 2 hours ago'],
    ['SzymonPL', 'Offline — Yesterday'],
    ['mikolaj_04', 'Offline — 3 days ago']
  ],
  activity: [
    ['Completed "Air Station - Break In"', '14 minutes ago'],
    ['Reached 16.9% Total Completion', '14 minutes ago'],
    ['Found 12 of 145 Collectibles', '2 hours ago'],
    ['Purchased Starlet Motel Room 4', 'Yesterday'],
    ['Joined a Free Mode session', 'Yesterday']
  ]
}

const TIPS = [
  'You can switch between Story and Online at any time from the main menu.',
  'Vehicles stored in your garage are repaired and returned automatically.',
  'Break line of sight with the police to lose a wanted level faster.',
  'Call a contact from your phone to start a new job at any time.',
  'Weapons can be customized at any Ammu-Nation in Leonida.',
  'Hold the accelerator before a jump to keep your speed on landing.',
  'Property owners can change the weather forecast channel on any television.'
]

/* Progress keyframes: [percent, elapsed ms]. The uneven spacing is what makes
   the bar stall the way a real streaming loader does. */
const LOAD_CURVE = {
  story: [[0,0],[9,700],[14,1500],[15,3300],[38,5300],[43,6200],[44,8700],[67,10600],
          [71,11500],[72,14000],[89,15700],[93,16500],[94,18800],[100,20600]],
  online:[[0,0],[6,900],[12,2100],[13,4600],[29,6600],[34,7600],[35,11000],[58,13200],
          [63,14300],[64,18000],[81,20000],[88,21200],[89,24500],[96,26200],[100,28000]],
  creator:[[0,0],[12,800],[19,1800],[20,3600],[46,5600],[52,6600],[53,9000],[78,11000],
           [84,12200],[85,14500],[100,16400]]
}

const LOAD_STAGES = {
  story: [[0,'Initializing'],[8,'Loading world data'],[26,'Streaming assets'],
          [45,'Loading vehicles and pedestrians'],[62,'Compiling shaders'],
          [78,'Syncing with Rockstar Games Social Club'],[92,'Preparing session'],
          [100,'Entering Leonida']],
  online:[[0,'Initializing'],[10,'Connecting to Rockstar Games Services'],[30,'Requesting session'],
          [52,'Loading online content'],[70,'Compiling shaders'],[85,'Matchmaking'],
          [96,'Waiting for other players'],[100,'Entering session']],
  creator:[[0,'Initializing'],[15,'Loading Creator tools'],[45,'Streaming map data'],
           [75,'Compiling shaders'],[100,'Entering Creator']]
}
