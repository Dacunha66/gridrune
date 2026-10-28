# Dacunha Cards Game Customization & Unity Implementation Guide

## 🎨 Customizing Cards in the Web Game

### 1. Card Structure
Cards are defined in `client/src/lib/cardData.ts` with the following properties:

```typescript
interface GameCard {
  id: string;           // Unique identifier
  name?: string;        // Display name (e.g., "Fire Dragon")
  image?: string;       // Path to card image
  description?: string; // Card description/lore
  rarity?: "common" | "rare" | "epic" | "legendary";
  top: number;         // Top attack value (1-9)
  right: number;       // Right attack value (1-9)
  bottom: number;      // Bottom attack value (1-9)
  left: number;        // Left attack value (1-9)
}
```

### 2. Adding Custom Cards
To create new cards, edit the `baseCards` array in `createPlayerDeck()`:

```typescript
const baseCards: Omit<GameCard, 'id'>[] = [
  { 
    name: "Your Custom Card", 
    image: "/images/custom-card.png",
    description: "A powerful creature from the depths",
    rarity: "legendary",
    top: 9, right: 8, bottom: 7, left: 6 
  },
  // Add more cards here...
];
```

### 3. Adding Card Images
1. Place images in `client/public/images/`
2. Reference them in card data: `image: "/images/fire-dragon.png"`
3. Update the Card component in `client/src/components/Card.tsx` to display images

### 4. Custom Card Effects
To add special card abilities, extend the GameCard interface:

```typescript
interface GameCard {
  // ... existing properties
  effect?: {
    type: "boost" | "drain" | "swap" | "reflect";
    value?: number;
    description: string;
  };
}
```

Then modify `client/src/lib/gameLogic.ts` to handle special effects.

### 5. Rarity System
Card rarities affect visual styling. Add rarity-based styling in `Card.tsx`:

```typescript
const getRarityColor = () => {
  switch (card.rarity) {
    case "legendary": return "border-yellow-500 bg-gradient-to-br from-yellow-600 to-yellow-800";
    case "epic": return "border-purple-500 bg-gradient-to-br from-purple-600 to-purple-800";
    case "rare": return "border-blue-500 bg-gradient-to-br from-blue-600 to-blue-800";
    default: return "border-gray-500 bg-gradient-to-br from-gray-600 to-gray-800";
  }
};
```

## 🎮 Unity Implementation Guide

### Core Architecture

```csharp
// 1. Card Data Structure
[System.Serializable]
public class GameCard
{
    public string id;
    public string cardName;
    public Sprite cardImage;
    public string description;
    public CardRarity rarity;
    public int topValue;
    public int rightValue;
    public int bottomValue;
    public int leftValue;
    public CardEffect effect;
}

public enum CardRarity { Common, Rare, Epic, Legendary }

[System.Serializable]
public class CardEffect
{
    public EffectType type;
    public int value;
    public string description;
}

public enum EffectType { None, Boost, Drain, Swap, Reflect }
```

### Game Manager Structure

```csharp
// 2. Game Manager
public class TripleTriadGameManager : MonoBehaviour
{
    [Header("Game State")]
    public GamePhase currentPhase;
    public int currentPlayer; // 1 or 2
    public BoardSlot[] board = new BoardSlot[9];
    public List<GameCard> player1Hand;
    public List<GameCard> player2Hand;
    public Player oCardOwner = Player.Neutral;
    
    [Header("UI References")]
    public CardUI[] boardSlots;
    public HandUI player1HandUI;
    public HandUI player2HandUI;
    public GameUI gameUI;
    
    public enum GamePhase { Ready, Playing, Ended }
    public enum Player { Neutral, Player1, Player2 }
    
    void Start()
    {
        InitializeGame();
    }
    
    void InitializeGame()
    {
        // Shuffle and deal cards
        var deck1 = CardDatabase.GetPlayerDeck(1);
        var deck2 = CardDatabase.GetPlayerDeck(2);
        
        player1Hand = ShuffleAndDeal(deck1, 5);
        player2Hand = ShuffleAndDeal(deck2, 5);
        
        // Place O-Card in center
        board[4] = new BoardSlot(CardDatabase.GetOCard(), Player.Neutral);
        
        currentPhase = GamePhase.Playing;
        currentPlayer = 1;
    }
}
```

### Board Slot System

```csharp
// 3. Board Slot
[System.Serializable]
public class BoardSlot
{
    public GameCard card;
    public GameCard originalCard; // For O-Card effect tracking
    public TripleTriadGameManager.Player owner;
    
    public BoardSlot(GameCard card, TripleTriadGameManager.Player owner)
    {
        this.card = card;
        this.originalCard = card;
        this.owner = owner;
    }
}
```

### Battle Resolution System

```csharp
// 4. Battle Logic
public class BattleResolver
{
    public static BattleResult ResolveBattles(BoardSlot[] board, int placedIndex, 
        TripleTriadGameManager.Player attacker, TripleTriadGameManager.Player oCardOwner)
    {
        var result = new BattleResult();
        var adjacentSlots = GetAdjacentSlots(placedIndex);
        
        // Separate O-Card battles from regular battles
        var oCardBattles = new List<int>();
        var regularBattles = new List<int>();
        
        foreach (int adjacentIndex in adjacentSlots)
        {
            if (board[adjacentIndex] == null || board[adjacentIndex].owner == attacker)
                continue;
                
            if (adjacentIndex == 4 || placedIndex == 4)
                oCardBattles.Add(adjacentIndex);
            else
                regularBattles.Add(adjacentIndex);
        }
        
        // Resolve O-Card battles first
        var currentOCardOwner = oCardOwner;
        foreach (int index in oCardBattles)
        {
            if (ResolveSingleBattle(board, placedIndex, index, attacker, currentOCardOwner))
            {
                result.capturedCards.Add(index);
                if (index == 4) currentOCardOwner = attacker;
            }
        }
        
        // Then resolve regular battles
        foreach (int index in regularBattles)
        {
            if (ResolveSingleBattle(board, placedIndex, index, attacker, currentOCardOwner))
                result.capturedCards.Add(index);
        }
        
        result.newOCardOwner = currentOCardOwner;
        return result;
    }
    
    static bool ResolveSingleBattle(BoardSlot[] board, int attackerIndex, int defenderIndex,
        TripleTriadGameManager.Player attacker, TripleTriadGameManager.Player oCardOwner)
    {
        var attackerCard = board[attackerIndex].originalCard;
        var defenderCard = board[defenderIndex].originalCard;
        
        var (attackValue, defenseValue) = GetBattleValues(attackerIndex, defenderIndex, 
            attackerCard, defenderCard);
        
        // Apply O-Card effect
        if (attacker == oCardOwner && attackerCard.id != "O")
            attackValue = Mathf.Min(9, attackValue + 1);
        if (board[defenderIndex].owner == oCardOwner && defenderCard.id != "O")
            defenseValue = Mathf.Min(9, defenseValue + 1);
        
        if (attackValue > defenseValue)
        {
            board[defenderIndex].owner = attacker;
            return true;
        }
        return false;
    }
}

public class BattleResult
{
    public List<int> capturedCards = new List<int>();
    public TripleTriadGameManager.Player newOCardOwner;
}
```

### Card Database

```csharp
// 5. Card Database
[CreateAssetMenu(fileName = "CardDatabase", menuName = "Dacunha Cards/Card Database")]
public class CardDatabase : ScriptableObject
{
    public GameCard[] allCards;
    public GameCard oCard;
    
    public static List<GameCard> GetPlayerDeck(int player)
    {
        // Return predefined deck for player
        var instance = Resources.Load<CardDatabase>("CardDatabase");
        return new List<GameCard>(instance.allCards);
    }
    
    public static GameCard GetOCard()
    {
        var instance = Resources.Load<CardDatabase>("CardDatabase");
        return instance.oCard;
    }
}
```

### UI System

```csharp
// 6. Card UI Component
public class CardUI : MonoBehaviour, IPointerClickHandler
{
    [Header("UI Elements")]
    public Image cardImage;
    public Text cardName;
    public Text topValue;
    public Text rightValue;
    public Text bottomValue;
    public Text leftValue;
    public Image rarityBorder;
    
    private GameCard card;
    private bool isInteractable = true;
    
    public void SetCard(GameCard card, TripleTriadGameManager.Player owner)
    {
        this.card = card;
        
        cardName.text = card.cardName;
        cardImage.sprite = card.cardImage;
        topValue.text = card.topValue.ToString();
        rightValue.text = card.rightValue.ToString();
        bottomValue.text = card.bottomValue.ToString();
        leftValue.text = card.leftValue.ToString();
        
        SetOwnerColor(owner);
        SetRarityBorder(card.rarity);
    }
    
    void SetOwnerColor(TripleTriadGameManager.Player owner)
    {
        Color ownerColor = owner switch
        {
            TripleTriadGameManager.Player.Player1 => Color.blue,
            TripleTriadGameManager.Player.Player2 => Color.red,
            _ => Color.yellow
        };
        
        GetComponent<Image>().color = ownerColor;
    }
    
    public void OnPointerClick(PointerEventData eventData)
    {
        if (isInteractable)
            TripleTriadGameManager.Instance.OnCardClicked(this);
    }
}
```

## 📁 Project Structure for Unity

```
Assets/
├── Scripts/
│   ├── GameManager/
│   │   ├── TripleTriadGameManager.cs
│   │   ├── BattleResolver.cs
│   │   └── GameState.cs
│   ├── Cards/
│   │   ├── GameCard.cs
│   │   ├── CardDatabase.cs
│   │   └── CardEffect.cs
│   ├── UI/
│   │   ├── CardUI.cs
│   │   ├── HandUI.cs
│   │   └── GameUI.cs
│   └── Audio/
│       └── AudioManager.cs
├── Prefabs/
│   ├── CardPrefab.prefab
│   ├── BoardSlot.prefab
│   └── GameManager.prefab
├── ScriptableObjects/
│   └── CardDatabase.asset
├── Sprites/
│   ├── Cards/
│   └── UI/
└── Audio/
    ├── SFX/
    └── Music/
```

## 🚀 Getting Started Steps

### For Web Game Customization:
1. Edit `client/src/lib/cardData.ts` to add new cards
2. Add images to `client/public/images/`
3. Update `Card.tsx` component for visual changes
4. Modify `gameLogic.ts` for new effects

### For Unity Implementation:
1. Create new Unity 2D project
2. Set up the folder structure above
3. Create CardDatabase ScriptableObject
4. Build UI prefabs with Canvas components
5. Implement the game manager and battle system
6. Add audio and visual effects
7. Create card collection and deck building systems

Both versions can share the same core game logic - just adapt the syntax from TypeScript to C#!