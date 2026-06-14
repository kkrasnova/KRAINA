import React from 'react';
import LandmarkQuizContent from './LandmarkQuizContent';

/** Окремий екран у стеку; той самий контент, що й друга сторінка пейджера в `LandmarkResultPage`. */
export default function LandmarkQuizPage(props) {
  return <LandmarkQuizContent {...props} pagerMode={false} hideHeader={false} />;
}
