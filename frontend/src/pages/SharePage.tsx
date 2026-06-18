import React from 'react';
import { useParams } from 'react-router-dom';

const SharePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  return <h1>Общий доступ по токену: {token}</h1>;
};

export default SharePage;
