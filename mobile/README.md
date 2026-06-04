# ResearchMind Mobile 📱

A React Native mobile application for AI-powered research with real-time streaming updates and knowledge graph visualization.

## Features

✅ **Search Interface** - Enter research topics and adjust depth (1-5 questions)  
✅ **Real-time Streaming** - Watch research progress with live agent activity feed  
✅ **Research History** - Browse past research with advanced filters (status, date range, search)  
✅ **Session Management** - Delete and manage research sessions  
✅ **Responsive Design** - Works on iOS and Android  
✅ **Dark Mode** - Beautiful dark theme optimized for long reading sessions  

## Getting Started

### Prerequisites
- Node.js 16+ and npm
- Expo CLI (`npm install -g eas-cli`)
- iOS Simulator (for macOS) or Android Emulator

### Installation

```bash
cd mobile
npm install
```

### Running the App

**Development Mode:**
```bash
npx expo start
```

Then press:
- `i` for iOS Simulator
- `a` for Android Emulator
- `w` for Web Browser

**For Physical Device:**
```bash
npx expo start --tunnel
```

Scan QR code with Expo Go app on your phone.

## Project Structure

```
mobile/
├── App.tsx                 # Main app navigation setup
├── screens/
│   ├── HomeScreen.tsx      # Search interface
│   ├── ResearchScreen.tsx  # Active research viewer
│   ├── HistoryScreen.tsx   # Past research browser
│   └── SettingsScreen.tsx  # App settings
├── app.json                # Expo configuration
└── package.json            # Dependencies
```

## Key Technologies

- **React Native** - Cross-platform mobile framework
- **Expo** - Development framework for React Native
- **React Navigation** - Navigation between screens
- **Axios** - HTTP client for API calls
- **TypeScript** - Type-safe development

## Backend Integration

The mobile app connects to the ResearchMind backend API:

```
https://researchmind-production-b6ca.up.railway.app
```

### API Endpoints Used

- `POST /research/start` - Start new research
- `GET /research/{id}/stream` - Real-time research updates (SSE)
- `GET /research/sessions/list` - Get research history
- `DELETE /research/{id}` - Delete research session

## Building for Production

### iOS

```bash
eas build --platform ios
```

### Android

```bash
eas build --platform android
```

## Troubleshooting

### Connection Issues
- Ensure backend is running and accessible
- Check internet connection on device
- Verify `BACKEND_URL` in screen components

### Build Errors
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Future Enhancements

- 🌙 Dark/Light mode toggle
- 📊 Advanced data visualization
- 🎨 Custom theming
- 🔔 Push notifications
- 💾 Offline mode with local caching
- 📤 Share research results
- 🎯 Custom research prompts

## Contributing

Pull requests are welcome! Please ensure:
- Code follows React Native best practices
- Components are properly typed with TypeScript
- Changes work on both iOS and Android

## License

MIT License - feel free to use this project

## Support

- 📧 Email: support@researchmind.ai
- 🌐 Website: https://researchmind-app.vercel.app
- 💬 GitHub Issues: Report bugs and request features
