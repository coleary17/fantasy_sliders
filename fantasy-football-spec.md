# Fantasy Football Playoff Scenario Explorer - Technical Specification

## Overview

An interactive web application where users control game outcomes by setting actual point totals (via sliders OR manual input), with real-time standings and playoff qualification updates.

## Core Concept

Users set the exact point totals for each team in each game. This directly updates each team's season Points For total and win/loss record, immediately showing playoff implications.

## User Interface Layout

### 1. Header Section

- League name: "The New World Order"
- Week indicator: "Week 14 - Final Regular Season Week"
- Playoff spots available: 6
- Brief instruction: "Set game scores to explore playoff scenarios"

### 2. Game Controls Section

For each of the 5 remaining games:

**Game Display Format:**
```
[Team A Name]  [Score Input/Slider]  vs  [Score Input/Slider]  [Team B Name]
Winner: Team A by 12 points (or "TIE" if equal)
```

**Dual Input Method for Each Team:**
- Slider: Range 70-180 points (realistic weekly scoring range)
- Text Input: Manual entry, synced with slider
- Both controls update each other bidirectionally
- Default starting value: 110 points (league average)

**Example Layout:**
```
No Punt Intended     [110] [========|====]     vs     [110] [====|========]     StiffArmRetirementVillage
                    slider (70-180)                        slider (70-180)
Result: TIE at 110-110
```

**Game List:**
1. No Punt Intended vs StiffArmRetirementVillage
2. NeverGonnaGibbsYouUp vs Up the Bucking Broncos
3. Garbage Time vs CeeDeez Nuts
4. Handcuff Hotel vs BlackRockSeahawks
5. Los Angeles Charjuns vs Parsons Green Charms

### 3. Live Standings Table

**Columns:**
- Rank (1-10)
- Team Name
- Record (W-L-T) - updates based on game outcomes
- Points For - Current season total + Week 14 score
- Playoff Status (✓ IN / ✗ OUT)
- Change indicator (↑↓ when rank changes)

**Sorting Logic:**
- Primary: Win total (descending)
- Tiebreaker: Points For (descending)
- Top 6 teams = Playoff teams
- Clear visual separation at the playoff cutoff line

**Visual Features:**
- Top 6 rows: Green background/border
- Rows 7-10: Gray/faded
- Animated reordering when standings change
- Bold the teams whose games you're currently adjusting

### 4. Quick Actions Panel

**Buttons:**
- "Reset All to 110" - Sets all games to 110-110 (neutral)
- "Random Scores" - Generates realistic random scores (95-145 range)

**Current Scenario Summary:**
- "Teams in playoff spots: [6 team names]"
- "Teams on the bubble: [teams ranked 5-8]"
- Display any ties at the playoff cutline

## Technical Implementation

### Data Structure

```javascript
const initialTeamData = {
  'Parsons Green Charms': { 
    wins: 9, 
    losses: 4, 
    ties: 0,
    pointsFor: 1761.80,
    week14Score: 110
  },
  'Los Angeles Charjuns': { 
    wins: 10, 
    losses: 3, 
    ties: 0,
    pointsFor: 1722.02,
    week14Score: 110
  },
  'CeeDeez Nuts': { 
    wins: 8, 
    losses: 5, 
    ties: 0,
    pointsFor: 1724.02,
    week14Score: 110
  },
  'BlackRockSeahawks': { 
    wins: 8, 
    losses: 5, 
    ties: 0,
    pointsFor: 1603.96,
    week14Score: 110
  },
  'Handcuff Hotel': { 
    wins: 7, 
    losses: 6, 
    ties: 0,
    pointsFor: 1428.30,
    week14Score: 110
  },
  'NeverGonnaGibbsYouUp': { 
    wins: 6, 
    losses: 7, 
    ties: 0,
    pointsFor: 1540.06,
    week14Score: 110
  },
  'StiffArmRetirementVillage': { 
    wins: 6, 
    losses: 7, 
    ties: 0,
    pointsFor: 1537.44,
    week14Score: 110
  },
  'Up the Bucking Broncos': { 
    wins: 7, 
    losses: 6, 
    ties: 0,
    pointsFor: 1428.20,
    week14Score: 110
  },
  'No Punt Intended': { 
    wins: 4, 
    losses: 9, 
    ties: 0,
    pointsFor: 1347.04,
    week14Score: 110
  },
  'Garbage Time': { 
    wins: 0, 
    losses: 12, 
    ties: 0,
    pointsFor: 1256.28,
    week14Score: 110
  }
};

const games = [
  { 
    id: 1, 
    team1: 'No Punt Intended',
    team2: 'NeverGonnaGibbsYouUp',

  },
  { 
    id: 2,
    team1: 'StiffArmRetirementVillage' 
    team2: 'Up the Bucking Broncos'
  },
  { 
    id: 3, 
    team1: 'Garbage Time',
    team2: 'BlackRockSeahawks'
  },
  { 
    id: 4, 
    team1: 'Handcuff Hotel',
    team2: 'Los Angeles Charjuns'
  },
  { 
    id: 5, 
    team1: 'CeeDeez Nuts',
    team2: 'Parsons Green Charms'
  }
];
```

### Core Algorithm

**1. On score change (slider or input):**
- Update week14Score in team state
- Validate input (70-180 range, numbers only)
- Sync slider ↔ text input
- Recalculate all standings
- Animate changes

**2. Calculate Standings:**

```javascript
For each team:
  - Start with current season record (wins/losses/ties) and pointsFor
  - Add week14Score to season pointsFor
  - Find their Week 14 game
  - Compare scores: higher score = win, lower = loss, equal = tie
  - Update record (add 1 to wins, losses, or ties)
  - Sort all teams by: wins DESC, then total PF DESC
  - Mark top 6 as playoff teams
```

**3. Handle Ties:**
- If scores are equal, game is a tie (no winner)
- Record becomes W-L-T format
- Display as "7-5-1" format

### Technology Stack

- **React** - State management for 10 scores, dynamic updates
- **Controlled inputs** - Both slider and text input share same state
- **Tailwind CSS** - Responsive grid layout, color coding

### Input Validation

```javascript
const validateScore = (value) => {
  const num = parseFloat(value);
  if (isNaN(num)) return 110;  // default
  return Math.max(70, Math.min(180, num));  // clamp to range
};
```

### Layout Structure

**Desktop (>768px):**
```
┌─────────────────────────────────────────────┐
│              Header & Quick Actions          │
├──────────────────────┬──────────────────────┤
│                      │                      │
│   Game Controls      │   Live Standings     │
│   (5 games)          │   (10 teams)         │
│                      │                      │
│   Sliders + Inputs   │   Sortable Table     │
│                      │                      │
└──────────────────────┴──────────────────────┘
```

**Mobile (<768px):**
```
┌─────────────────────┐
│  Header & Actions   │
├─────────────────────┤
│  Game Controls      │
│  (stacked)          │
├─────────────────────┤
│  Live Standings     │
│  (scrollable)       │
└─────────────────────┘
```

## Key Features

### 1. Realistic Defaults

Start all games at 110 points (round number, close to season average)

### 2. Input Flexibility

- Click slider for quick adjustments
- Type exact values for precision
- Arrow keys work in text inputs for fine-tuning
- Slider and text box always stay in sync

### 3. Visual Feedback

**When you adjust a game:**
- Score difference displayed prominently under each game
- Instant standings update
- Animated rank changes

**Playoff Line:**
- Thick horizontal line or color change between 6th and 7th place
- Clear visual distinction between IN and OUT
- Green checkmark for playoff teams, red X for eliminated

### 4. Score Validation

- Text inputs only accept numbers
- Values automatically clamped to 70-180 range
- Invalid inputs revert to last valid value
- Smooth slider behavior

### 5. Quick Reset

- "Reset All to 110" button returns to neutral state
- "Random Scores" generates realistic random outcomes (95-145 range)

## Component Breakdown

### Components Needed:

1. **App** (main container)
2. **Header** (title, instructions)
3. **QuickActions** (reset buttons, scenario summary)
4. **GameControls** (container for all 5 games)
5. **GameControl** (single game with 2 score inputs)
6. **ScoreInput** (slider + text input combo, used 2x per game)
7. **StandingsTable** (displays sorted teams)
8. **StandingsRow** (single team row)

### State Management:

- Single state object with all team data
- Derived calculations for standings
- No need for complex state management library

## Visual Design

### Color Scheme:

- **Playoff teams (1-6):** Green background (#dcfce7) with green border
- **Eliminated teams (7-10):** Gray background (#f3f4f6)
- **Playoff cutline:** Thick green border between ranks 6 and 7
- **Game result indicators:** Green for winner, red for loser, yellow for tie

### Typography:

- **Headers:** Bold, large (text-xl, text-2xl)
- **Team names:** Medium weight, clear
- **Scores:** Monospace font for alignment
- **Records:** Monospace (e.g., "7-6-0")

### Responsive Design:

- **Desktop:** Side-by-side layout (games left, standings right)
- **Mobile:** Stacked layout (games above, standings below)
- Touch-friendly sliders on mobile (larger hit targets)
- Scrollable standings table on small screens

## Edge Cases to Handle

### 1. Invalid inputs
Non-numeric, negative, >180 points
- Sanitize and clamp to valid range (70-180)
- Revert to previous valid value on invalid input

### 2. Ties in standings
- Show teams with identical records/PF at same rank
- Handle 3+ way ties correctly
- Indicate tied status at playoff cutline

### 3. Mobile text input
- Use type="number" for mobile keyboard
- Prevent zoom on input focus (font-size: 16px minimum)

### 4. Performance
- Debounce rapid slider changes (optional)
- Memoize standings calculations if needed

## Implementation Notes

### Slider/Input Sync:

```javascript
const [score, setScore] = useState(110);

const handleSliderChange = (e) => {
  setScore(Number(e.target.value));
};

const handleInputChange = (e) => {
  const value = validateScore(e.target.value);
  setScore(value);
};
```

### Standings Calculation:

```javascript
const calculateStandings = (teamData, games) => {
  // Create a map to find each team's opponent and scores
  const gameResults = {};
  games.forEach(game => {
    gameResults[game.team1] = {
      opponent: game.team2,
      teamScore: teamData[game.team1].week14Score,
      oppScore: teamData[game.team2].week14Score
    };
    gameResults[game.team2] = {
      opponent: game.team1,
      teamScore: teamData[game.team2].week14Score,
      oppScore: teamData[game.team1].week14Score
    };
  });

  return Object.entries(teamData)
    .map(([name, data]) => {
      const result = gameResults[name];
      let newWins = data.wins;
      let newLosses = data.losses;
      let newTies = data.ties;
      
      if (result.teamScore > result.oppScore) {
        newWins++;
      } else if (result.teamScore < result.oppScore) {
        newLosses++;
      } else {
        newTies++;
      }

      return {
        name,
        wins: newWins,
        losses: newLosses,
        ties: newTies,
        pointsFor: data.pointsFor + data.week14Score,
        inPlayoffs: false  // calculated after sort
      };
    })
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.pointsFor - a.pointsFor;
    })
    .map((team, index) => ({
      ...team,
      rank: index + 1,
      inPlayoffs: index < 6
    }));
};
```

### Game Result Display:

```javascript
const getGameResult = (score1, score2, team1, team2) => {
  if (score1 === score2) return "TIE";
  const winner = score1 > score2 ? team1 : team2;
  const margin = Math.abs(score1 - score2);
  return `${winner} by ${margin.toFixed(1)}`;
};
```

## Deliverable

A single-page React application (can be built as artifact) that:
- Loads with all games at 110-110
- Allows user to adjust scores via sliders or text inputs
- Updates standings in real-time
- Clearly shows which 6 teams make playoffs
- Provides reset and random scenario functionality
- Works responsively on desktop and mobile
