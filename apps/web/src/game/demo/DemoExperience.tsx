import { useEffect, useState, useCallback } from 'react';
import { useDemoStore } from './store';
import './demo.css';

export function DemoExperience() {
  const { demoPhase, activeExperience, completeDemo, exitDemo } = useDemoStore();
  const [timeLeft, setTimeLeft] = useState(30);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (demoPhase !== 'playing' || !activeExperience) return;
    
    const duration = activeExperience.duration || 30000;
    setTimeLeft(Math.floor(duration / 1000));
    setCurrentSlide(0);
    
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          completeDemo();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [demoPhase, activeExperience, completeDemo]);

  useEffect(() => {
    if (demoPhase !== 'playing' || !activeExperience) return;
    const slides = activeExperience.slides;
    if (slides.length === 0) return;
    
    // Advance slides based on time
    const slideIndex = Math.floor((30 - timeLeft) / (30 / slides.length));
    if (slideIndex >= 0 && slideIndex < slides.length && slideIndex !== currentSlide) {
      setCurrentSlide(slideIndex);
    }
  }, [timeLeft, demoPhase, activeExperience, currentSlide]);

  if (demoPhase !== 'playing' || !activeExperience) return null;

  const slides = activeExperience.slides;
  const slide = slides[currentSlide] ?? slides[0];
  if (!slide) return null;

  const handleSkip = useCallback(() => {
    completeDemo();
  }, [completeDemo]);

  const handleExit = useCallback(() => {
    if (confirm('Are you sure you want to exit the demo? Your progress will not be saved for completion.')) {
      exitDemo();
    }
  }, [exitDemo]);

  return (
    <div className="demo-overlay" role="dialog" aria-modal="true" aria-label="Booth Demo Experience">
      <div className="demo-header">
        <div className="demo-header__info">
          <span className="demo-header__logo">{activeExperience.companyLogo || '🏢'}</span>
          <div className="demo-header__text">
            <div className="demo-header__company">{activeExperience.companyName}</div>
            <div className="demo-header__product">{activeExperience.productName}</div>
          </div>
        </div>
        <div className="demo-header__timer">
          <div className="demo-timer__ring">
            <svg viewBox="0 0 36 36" className="demo-timer__svg">
              <path
                className="demo-timer__bg"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="demo-timer__progress"
                strokeDasharray={`${(timeLeft / 30) * 100}, 100`}
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="demo-timer__text">{timeLeft}s</div>
          </div>
        </div>
        <button className="demo-header__exit" onClick={handleExit} title="Exit Demo">✕</button>
      </div>

      <div className="demo-progress-bar">
        <div className="demo-progress-bar__fill" style={{ width: `${((30 - timeLeft) / 30) * 100}%` }} />
      </div>

      <div className="demo-content" style={{ background: slide.background || 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
        <div className={`demo-slide demo-slide--${slide.animation || 'fade'} demo-slide--active`}>
          {slide.type === 'animated' || slide.type === 'text' ? (
            <div className="demo-slide__inner">
              {slide.title && <h1 className="demo-slide__title">{slide.title}</h1>}
              {slide.content && <p className="demo-slide__content">{slide.content}</p>}
              {slide.bullets && slide.bullets.length > 0 && (
                <ul className="demo-slide__bullets">
                  {slide.bullets.map((bullet, i) => (
                    <li key={i} style={{ animationDelay: `${i * 0.2}s` }}>{bullet}</li>
                  ))}
                </ul>
              )}
              {slide.callToAction && (
                <div className="demo-slide__cta">{slide.callToAction}</div>
              )}
            </div>
          ) : slide.type === 'image' ? (
            <div className="demo-slide__inner demo-slide__inner--image">
              {slide.title && <h1 className="demo-slide__title">{slide.title}</h1>}
              {slide.imageUrl ? (
                <img src={slide.imageUrl} alt={slide.title || ''} className="demo-slide__image" />
              ) : (
                <div className="demo-slide__placeholder">🖼️ {slide.content}</div>
              )}
            </div>
          ) : (
            <div className="demo-slide__inner">
              {slide.title && <h1 className="demo-slide__title">{slide.title}</h1>}
              <p className="demo-slide__content">{slide.content || activeExperience.productDescription}</p>
            </div>
          )}
        </div>
      </div>

      <div className="demo-footer">
        <div className="demo-footer__info">
          <span className="demo-footer__category">{activeExperience.category}</span>
          <span className="demo-footer__dots">
            {slides.map((_, i) => (
              <span key={i} className={`demo-footer__dot ${i === currentSlide ? 'active' : ''}`} />
            ))}
          </span>
        </div>
        <button className="demo-footer__skip" onClick={handleSkip}>
          Skip to Quiz →
        </button>
      </div>
    </div>
  );
}
