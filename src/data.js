export const initialTeamData = {
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
    losses: 13, 
    ties: 0,
    pointsFor: 1256.28,
    week14Score: 110
  }
};

export const games = [
  { 
    id: 1, 
    team1: 'No Punt Intended',
    team2: 'NeverGonnaGibbsYouUp'
  },
  { 
    id: 2,
    
    team1: 'StiffArmRetirementVillage',
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

export const validateScore = (value) => {
  const num = parseFloat(value);
  if (isNaN(num)) return 110;  // default
  return Math.max(70, Math.min(180, num));  // clamp to range
};

export const calculateStandings = (teamData, games) => {
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

export const getGameResult = (score1, score2, team1, team2) => {
  if (score1 === score2) return "TIE";
  const winner = score1 > score2 ? team1 : team2;
  const margin = Math.abs(score1 - score2);
  return `${winner} by ${margin.toFixed(1)}`;
};