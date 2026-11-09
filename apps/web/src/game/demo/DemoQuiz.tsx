import { useState } from 'react';
import { useDemoStore } from './store';
import './demo.css';

export function DemoQuiz() {
  const { demoPhase, activeExperience, answerQuiz, finishDemo } = useDemoStore();
  const [answers, setAnswers] = useState<number[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [quizResult, setQuizResult] = useState<{ correct: boolean; pointsEarned: number } | null>(null);

  if (demoPhase !== 'quiz' || !activeExperience) return null;

  const questions = activeExperience.quiz;
  const question = questions[currentQuestion];
  if (!question) return null;

  const handleSelectAnswer = (optionIndex: number) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestion] = optionIndex;
    setAnswers(newAnswers);
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      // Submit quiz
      const result = answerQuiz(answers);
      setQuizResult(result);
      setShowResults(true);
    }
  };

  const handleFinish = () => {
    finishDemo();
  };

  if (showResults && quizResult) {
    return (
      <div className="demo-overlay" role="dialog" aria-modal="true">
        <div className="demo-quiz">
          <div className="demo-quiz__header">
            <h1 className="demo-quiz__title">Demo Complete!</h1>
            <p className="demo-quiz__subtitle">{activeExperience.companyName} - {activeExperience.productName}</p>
          </div>
          
          <div className="demo-quiz__results">
            <div className={`demo-quiz__result-icon ${quizResult.correct ? 'correct' : 'partial'}`}>
              {quizResult.correct ? '🎉' : '✅'}
            </div>
            <h2 className="demo-quiz__result-title">
              {quizResult.correct ? 'Perfect Score!' : 'Demo Completed!'}
            </h2>
            <p className="demo-quiz__result-message">
              {quizResult.correct 
                ? 'All answers correct! Great job learning about the product.'
                : 'You completed the demo. Review the product details to improve next time.'}
            </p>
            
            {quizResult.pointsEarned > 0 && (
              <div className="demo-quiz__bonus">
                <span className="demo-quiz__bonus-icon">⭐</span>
                <span className="demo-quiz__bonus-text">+{quizResult.pointsEarned} Quiz Bonus Points!</span>
              </div>
            )}
          </div>
          
          <button className="demo-quiz__finish" onClick={handleFinish}>
            Continue Exploring →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="demo-overlay" role="dialog" aria-modal="true" aria-label="Demo Quiz">
      <div className="demo-quiz">
        <div className="demo-quiz__header">
          <div className="demo-quiz__progress">
            Question {currentQuestion + 1} of {questions.length}
          </div>
          <h1 className="demo-quiz__title">Knowledge Check</h1>
          <p className="demo-quiz__subtitle">Test what you learned about {activeExperience.productName}</p>
        </div>
        
        <div className="demo-quiz__question">
          <h2 className="demo-quiz__question-text">{question.question}</h2>
          
          <div className="demo-quiz__options">
            {question.options.map((option, index) => (
              <button
                key={index}
                className={`demo-quiz__option ${answers[currentQuestion] === index ? 'selected' : ''}`}
                onClick={() => handleSelectAnswer(index)}
              >
                <span className="demo-quiz__option-letter">{String.fromCharCode(65 + index)}</span>
                <span className="demo-quiz__option-text">{option}</span>
              </button>
            ))}
          </div>
        </div>
        
        <div className="demo-quiz__footer">
          <button 
            className="demo-quiz__next" 
            onClick={handleNext}
            disabled={answers[currentQuestion] === undefined}
          >
            {currentQuestion < questions.length - 1 ? 'Next Question →' : 'Submit Quiz →'}
          </button>
        </div>
      </div>
    </div>
  );
}
